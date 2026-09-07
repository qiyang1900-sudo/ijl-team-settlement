begin;

alter table public.discord_reminder_logs
  add column if not exists source text,
  add column if not exists status_before_send text,
  add column if not exists checked_at timestamptz,
  add column if not exists skip_reason text;

-- Export is an operation, not an approval state. Preserve all approval/export timestamps.
update public.project_teams
set status = 'approved'
where status = 'exported';

commit;
select pg_notify('pgrst', 'reload schema');
