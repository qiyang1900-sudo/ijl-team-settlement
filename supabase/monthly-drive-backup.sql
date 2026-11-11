begin;
create table if not exists public.monthly_drive_backup_config (
  id boolean primary key default true check(id),
  refresh_token_encrypted text not null,
  folder_id text not null check(folder_id='1ZMnCooqyGDerJ0uwdCkj47GMChU13odx'),
  enabled boolean not null default false,
  last_error text,
  last_attempt_at timestamptz,
  connected_at timestamptz not null default now()
);
create table if not exists public.monthly_drive_backup_runs (
  run_key text primary key,
  status text not null check(status in ('running','failed','completed')),
  file_id text not null,
  file_name text not null,
  snapshot jsonb not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.monthly_drive_backup_config enable row level security;
alter table public.monthly_drive_backup_runs enable row level security;
revoke all on public.monthly_drive_backup_config,public.monthly_drive_backup_runs from public,anon,authenticated,service_role;
grant select,insert,update on public.monthly_drive_backup_config,public.monthly_drive_backup_runs to service_role;

-- A single statement snapshot: monthly data, roster identity and review inputs.
-- No credentials, Discord webhooks or binary attachment contents are exported.
create or replace function public.monthly_backup_snapshot() returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb; t text; records jsonb;
begin
  result:=jsonb_build_object('format','ijl-monthly-backup-v1','captured_at',statement_timestamp(),
    'attachments','References only; original image objects remain in Supabase Storage.',
    'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'short_name',short_name) order by id),'[]'::jsonb) from public.teams));
  foreach t in array array['league_players','monthly_player_assignments','monthly_data_settings','monthly_data_submissions','team_monthly_scores','team_incentive_reviews','monthly_incentive_results'] loop
    if to_regclass('public.'||t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',t) into records;
      result:=result||jsonb_build_object(t,records);
    else
      raise exception 'Backup table missing: %',t;
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.monthly_backup_snapshot() from public,anon,authenticated;
grant execute on function public.monthly_backup_snapshot() to service_role;

create or replace function public.claim_monthly_drive_backup(p_key text,p_file_id text,p_file_name text,p_tiktok jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.monthly_drive_backup_runs;
begin
  if p_tiktok is null or jsonb_typeof(p_tiktok->'rows') is distinct from 'array' then raise exception 'TT snapshot missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended('monthly-drive-backup:'||p_key,0));
  select * into r from public.monthly_drive_backup_runs where run_key=p_key for update;
  if found then
    if r.status='completed' then return to_jsonb(r); end if;
    if r.status='running' and r.updated_at>now()-interval '10 minutes' then raise exception '备份正在进行，请稍后查看。'; end if;
    update public.monthly_drive_backup_runs set status='running',error=null,updated_at=now() where run_key=p_key returning * into r;
  else
    insert into public.monthly_drive_backup_runs(run_key,status,file_id,file_name,snapshot)
      values(p_key,'running',p_file_id,p_file_name,public.monthly_backup_snapshot()||jsonb_build_object('tiktok',p_tiktok)) returning * into r;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.claim_monthly_drive_backup(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_monthly_drive_backup(text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
