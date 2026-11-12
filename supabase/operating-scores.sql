begin;

create table if not exists public.team_operating_reviews (
  team_id uuid not null references public.teams(id),
  target_month text not null check (target_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and target_month >= '2026-10'),
  status text not null check (status in ('draft', 'reviewed')),
  rule_version text not null,
  inputs jsonb not null default '{}'::jsonb,
  source_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, target_month)
);
create table if not exists public.team_operating_review_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  target_month text not null,
  record jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists team_operating_history_month_idx on public.team_operating_review_history(target_month, team_id, created_at desc);

alter table public.team_operating_reviews enable row level security;
alter table public.team_operating_review_history enable row level security;
revoke all on public.team_operating_reviews, public.team_operating_review_history from public, anon, authenticated, service_role;
grant select, insert, update on public.team_operating_reviews to service_role;
grant select, insert on public.team_operating_review_history to service_role;

create or replace function public.record_operating_score_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.team_operating_review_history (team_id, target_month, record)
  values (new.team_id, new.target_month, to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.record_operating_score_revision() from public, anon, authenticated;
drop trigger if exists operating_score_revision on public.team_operating_reviews;
create trigger operating_score_revision after insert or update on public.team_operating_reviews
for each row execute function public.record_operating_score_revision();

notify pgrst, 'reload schema';
commit;
