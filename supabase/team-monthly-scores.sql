create table if not exists team_monthly_scores (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  target_month text not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  player_management_score integer not null default 15 check (player_management_score between 0 and 15),
  player_management_note text,
  team_management_score integer not null default 25 check (team_management_score between 0 and 25),
  team_management_note text,
  youtube_manual_deduction integer not null default 0 check (youtube_manual_deduction between 0 and 30),
  youtube_manual_note text,
  tiktok_manual_deduction integer not null default 0 check (tiktok_manual_deduction between 0 and 15),
  tiktok_manual_note text,
  x_manual_deduction integer not null default 0 check (x_manual_deduction between 0 and 15),
  x_manual_note text,
  reviewer_note text,
  finalized_score integer,
  finalized_grade text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, target_month)
);

create index if not exists team_monthly_scores_target_month_idx
on team_monthly_scores (target_month);

grant select, insert, update, delete on table public.team_monthly_scores to anon;
grant select, insert, update, delete on table public.team_monthly_scores to authenticated;
grant select, insert, update, delete on table public.team_monthly_scores to service_role;

alter table team_monthly_scores enable row level security;

drop policy if exists "team monthly scores are readable" on team_monthly_scores;
create policy "team monthly scores are readable"
on team_monthly_scores for select
using (true);

drop policy if exists "team monthly scores are writable" on team_monthly_scores;
create policy "team monthly scores are writable"
on team_monthly_scores for insert
with check (true);

drop policy if exists "team monthly scores are updatable" on team_monthly_scores;
create policy "team monthly scores are updatable"
on team_monthly_scores for update
using (true)
with check (true);

drop policy if exists "team monthly scores are deletable" on team_monthly_scores;
create policy "team monthly scores are deletable"
on team_monthly_scores for delete
using (true);
