begin;

create table if not exists public.project_report_drive_exports (
  project_team_id uuid primary key references public.project_teams(id) on delete cascade,
  folder_id text not null,
  file_id text not null unique,
  file_name text,
  byte_size bigint,
  uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.project_report_drive_exports enable row level security;
revoke all on public.project_report_drive_exports from public, anon, authenticated;
grant select, insert, update, delete on public.project_report_drive_exports to service_role;

commit;
select pg_notify('pgrst', 'reload schema');
