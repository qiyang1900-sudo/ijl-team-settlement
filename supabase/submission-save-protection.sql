begin;

-- Saving the reusable company profile uses ON CONFLICT(team_id).
create unique index if not exists team_profiles_team_unique on public.team_profiles(team_id);

create table if not exists public.submission_change_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  operation text not null,
  before_row jsonb,
  after_row jsonb,
  source text,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.submission_change_history enable row level security;
revoke all on public.submission_change_history from public, anon, authenticated, service_role;
grant select, insert on public.submission_change_history to service_role;
create index if not exists submission_history_record_idx on public.submission_change_history(table_name, record_id, recorded_at);

create or replace function public.capture_submission_change() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  insert into public.submission_change_history(table_name,record_id,operation,before_row,after_row,source)
  values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',
    (coalesce(to_jsonb(new),to_jsonb(old))->>'team_id')||':'||(coalesce(to_jsonb(new),to_jsonb(old))->>'target_month')),tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    nullif(current_setting('app.change_source',true),''));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.capture_submission_change() from public, anon, authenticated;
grant execute on function public.capture_submission_change() to service_role;

do $$ declare t text; begin
  foreach t in array array['monthly_data_submissions','monthly_player_assignments','project_teams',
    'submission_company_info','settlement_summary_rows','settlement_detail_rows','report_rows',
    'submission_files','team_profiles','team_incentive_reviews','team_monthly_scores'] loop
    if to_regclass('public.'||t) is not null then
      if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||t) and tgname='capture_submission_change') then
        execute format('create trigger capture_submission_change after insert or update or delete on public.%I for each row execute function public.capture_submission_change()',t);
      end if;
      execute format('insert into public.submission_change_history(table_name,record_id,operation,after_row,source)
        select %L,coalesce(to_jsonb(r)->>''id'',(to_jsonb(r)->>''team_id'')||'':''||(to_jsonb(r)->>''target_month'')),''BASELINE'',to_jsonb(r),''save-protection-install'' from public.%I r
        where not exists(select 1 from public.submission_change_history h where h.table_name=%L and h.record_id=coalesce(to_jsonb(r)->>''id'',(to_jsonb(r)->>''team_id'')||'':''||(to_jsonb(r)->>''target_month'')))',t,t,t);
    end if;
  end loop;
end $$;

-- All imported teams commit together. Compare the exact record read by the server.
create or replace function public.import_monthly_submissions_atomic(p_rows jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare item jsonb; prior public.monthly_data_submissions; patch jsonb;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid import batch'; end if;
  if jsonb_array_length(p_rows)>500 then raise exception 'Invalid import batch'; end if;
  perform set_config('app.change_source','monthly-import',true);
  for item in select value from jsonb_array_elements(p_rows) order by value->'patch'->>'team_id',value->'patch'->>'target_month' loop
    patch := item->'patch';
    select * into prior from public.monthly_data_submissions
      where team_id=(patch->>'team_id')::uuid and target_month=patch->>'target_month' for update;
    if found then
      if to_jsonb(prior) is distinct from item->'before' then raise exception '数据已被其他页面修改，整批导入已取消，请重新预览。'; end if;
      update public.monthly_data_submissions set player_rows=patch->'player_rows',status='approved',
        return_reason=null,approved_at=now(),updated_at=clock_timestamp() where id=prior.id;
    else
      if item->'before' is distinct from 'null'::jsonb then raise exception '原记录已变化，整批导入已取消。'; end if;
      insert into public.monthly_data_submissions(team_id,target_month,player_rows,status,approved_at,updated_at)
        values((patch->>'team_id')::uuid,patch->>'target_month',patch->'player_rows','approved',now(),clock_timestamp());
    end if;
  end loop;
end $$;
revoke all on function public.import_monthly_submissions_atomic(jsonb) from public, anon, authenticated;
grant execute on function public.import_monthly_submissions_atomic(jsonb) to service_role;

create or replace function public.project_submission_state(p_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'project', (select to_jsonb(p) from public.project_teams p where p.id=p_id),
    'company', (select to_jsonb(c) from public.submission_company_info c where c.project_team_id=p_id),
    'summary', coalesce((select jsonb_agg(to_jsonb(r) order by r.row_number,r.id) from public.settlement_summary_rows r where r.project_team_id=p_id),'[]'::jsonb),
    'details', coalesce((select jsonb_agg(to_jsonb(r) order by r.row_number,r.id) from public.settlement_detail_rows r where r.project_team_id=p_id),'[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.row_number,r.id) from public.report_rows r where r.project_team_id=p_id),'[]'::jsonb),
    'files', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.submission_files r where r.project_team_id=p_id),'[]'::jsonb)
  );
$$;
revoke all on function public.project_submission_state(uuid) from public, anon, authenticated;
grant execute on function public.project_submission_state(uuid) to service_role;

create or replace function public.save_project_submission_atomic(p_id uuid,p_team_id uuid,p_before jsonb,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare pt public.project_teams; r jsonb; c jsonb; action text; i int;
begin
  select * into pt from public.project_teams where id=p_id for update;
  if not found or pt.team_id is distinct from p_team_id then raise exception '提出対象が確認できません。'; end if;
  if pt.status in ('submitted','resubmitted','reviewing','approved','exported') then raise exception '提出済み・審査中・承認済みの内容は変更できません。'; end if;
  if p_before is null or public.project_submission_state(p_id) is distinct from p_before then
    raise exception '他の画面で内容または審査状況が更新されました。保存内容は変更していません。ページを開き直してください。';
  end if;
  action:=p_payload->>'action';
  if action is null or action not in ('draft','submit') or jsonb_typeof(p_payload->'summary') is distinct from 'array'
    or jsonb_typeof(p_payload->'details') is distinct from 'array' or jsonb_typeof(p_payload->'reports') is distinct from 'array'
    or jsonb_typeof(p_payload->'remove_file_ids') is distinct from 'array' or jsonb_typeof(p_payload->'new_files') is distinct from 'array'
    then raise exception '提出内容が不正です。'; end if;
  if jsonb_array_length(p_payload->'summary') not between 1 and 3
    or jsonb_array_length(p_payload->'details') not between 1 and 7
    or jsonb_array_length(p_payload->'details') <> jsonb_array_length(p_payload->'reports') then raise exception '提出内容が不正です。'; end if;
  perform set_config('app.change_source','project-save',true);
  c:=p_payload->'company';
  insert into public.submission_company_info(project_team_id,company_name,bank_name,bank_account_number,swift_code,used_saved_profile,updated_at)
    values(p_id,c->>'company_name',c->>'bank_name',c->>'bank_account_number',c->>'swift_code',coalesce((c->>'used_saved_profile')::boolean,false),now())
    on conflict(project_team_id) do update set company_name=excluded.company_name,bank_name=excluded.bank_name,bank_account_number=excluded.bank_account_number,
      swift_code=excluded.swift_code,used_saved_profile=excluded.used_saved_profile,updated_at=excluded.updated_at;
  if (c->>'used_saved_profile')::boolean then
    insert into public.team_profiles(team_id,company_name,bank_name,bank_account_number,swift_code,updated_at)
      values(p_team_id,c->>'company_name',c->>'bank_name',c->>'bank_account_number',c->>'swift_code',now())
      on conflict(team_id) do update set company_name=excluded.company_name,bank_name=excluded.bank_name,bank_account_number=excluded.bank_account_number,swift_code=excluded.swift_code,updated_at=excluded.updated_at;
  end if;
  delete from public.settlement_summary_rows where project_team_id=p_id;
  for r,i in select value,ordinality::int from jsonb_array_elements(p_payload->'summary') with ordinality loop
    insert into public.settlement_summary_rows(project_team_id,row_number,payment_content,delivery_due_date,contract_payment_standard,completion_standard,project_team_confirmation,note)
      values(p_id,i,r->>'payment_content',nullif(r->>'delivery_due_date','')::date,'時間通り','時間通り','確認','');
  end loop;
  delete from public.settlement_detail_rows where project_team_id=p_id;
  for r,i in select value,ordinality::int from jsonb_array_elements(p_payload->'details') with ordinality loop
    insert into public.settlement_detail_rows(project_team_id,row_number,service_item,quantity,unit_price,amount_match,note)
      values(p_id,i,r->>'service_item',(r->>'quantity')::numeric,(r->>'unit_price')::numeric,true,r->>'note');
  end loop;
  -- Keep report IDs stable where possible, including any file foreign keys.
  delete from public.report_rows where project_team_id=p_id and row_number > jsonb_array_length(p_payload->'reports');
  for r,i in select value,ordinality::int from jsonb_array_elements(p_payload->'reports') with ordinality loop
    update public.report_rows set item_content=r->>'item_content',category_type=r->>'category_type',amount=(r->>'amount')::numeric,
      link_url=nullif(r->>'link_url',''),implementation_date=nullif(r->>'implementation_date','')::date,updated_at=now()
      where project_team_id=p_id and row_number=i;
    if not found then
      insert into public.report_rows(project_team_id,row_number,item_content,category_type,amount,link_url,implementation_date,publish_channel,note)
        values(p_id,i,r->>'item_content',r->>'category_type',(r->>'amount')::numeric,nullif(r->>'link_url',''),nullif(r->>'implementation_date','')::date,'','');
    end if;
  end loop;
  -- Remove references only. Historical image objects stay available for recovery.
  delete from public.submission_files where project_team_id=p_id and file_category='report_screenshot'
    and id::text in (select jsonb_array_elements_text(p_payload->'remove_file_ids'));
  for r in select value from jsonb_array_elements(p_payload->'new_files') loop
    insert into public.submission_files(project_team_id,file_category,submit_method,file_name,file_url,storage_path,mime_type,note)
      values(p_id,'report_screenshot','upload',r->>'file_name',r->>'file_url',r->>'storage_path',r->>'mime_type',r->>'note');
  end loop;
  delete from public.submission_files where project_team_id=p_id and file_category='invoice_confirmation';
  if nullif(p_payload->>'invoice_url','') is not null then
    insert into public.submission_files(project_team_id,file_category,submit_method,file_name,file_url,note)
      values(p_id,'invoice_confirmation','external_drive','請求書アップロード済み',p_payload->>'invoice_url','請求書アップロード確認');
  end if;
  update public.project_teams set status=case when action='submit' then case when pt.status='returned' then 'resubmitted' else 'submitted' end else 'draft' end,
    submitted_at=case when action='submit' then now() else submitted_at end,
    returned_at=case when action='submit' then null else returned_at end,
    return_reason=case when action='submit' then null else return_reason end,updated_at=clock_timestamp() where id=p_id;
  return public.project_submission_state(p_id);
end $$;
revoke all on function public.save_project_submission_atomic(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_project_submission_atomic(uuid,uuid,jsonb,jsonb) to service_role;

select pg_notify('pgrst','reload schema');
commit;
