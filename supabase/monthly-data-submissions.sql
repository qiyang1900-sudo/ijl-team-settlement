create table if not exists monthly_data_submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  target_month text not null,
  status text not null default 'not_submitted',
  player_rows jsonb not null default '[]'::jsonb,
  club_activity_link text,
  club_activity_image_url text,
  club_activity_image_name text,
  club_activity_image_mime_type text,
  club_activity_image_storage_path text,
  return_reason text,
  submitted_at timestamptz,
  reviewing_at timestamptz,
  returned_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, target_month)
);

alter table monthly_data_submissions enable row level security;

drop policy if exists "monthly data submissions are readable" on monthly_data_submissions;
create policy "monthly data submissions are readable"
on monthly_data_submissions for select
using (true);

drop policy if exists "monthly data submissions are writable" on monthly_data_submissions;
create policy "monthly data submissions are writable"
on monthly_data_submissions for insert
with check (true);

drop policy if exists "monthly data submissions are updatable" on monthly_data_submissions;
create policy "monthly data submissions are updatable"
on monthly_data_submissions for update
using (true)
with check (true);
