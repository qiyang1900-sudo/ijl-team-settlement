-- Historical evidence is private and separate from monthly submissions.
begin;
create table if not exists public.team_incentive_designated_sources (
  team_id uuid not null references public.teams(id),
  target_month text not null check (target_month ~ '^2026-0[789]$'),
  sources jsonb not null check (jsonb_typeof(sources) = 'array'),
  imported_at timestamptz not null default now(),
  primary key (team_id, target_month)
);
alter table public.team_incentive_designated_sources enable row level security;
revoke all on public.team_incentive_designated_sources from public, anon, authenticated;
grant select, insert, update on public.team_incentive_designated_sources to service_role;
create or replace function public.monthly_backup_snapshot() returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb; t text; records jsonb;
begin
  result:=jsonb_build_object('format','ijl-monthly-backup-v1','captured_at',statement_timestamp(),
    'attachments','References only; original image objects remain in Supabase Storage.',
    'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'short_name',short_name) order by id),'[]'::jsonb) from public.teams));
  foreach t in array array['league_players','monthly_player_assignments','monthly_data_settings','monthly_data_submissions','team_monthly_scores','team_incentive_reviews','monthly_incentive_results','team_incentive_designated_sources'] loop
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
notify pgrst, 'reload schema';
commit;
