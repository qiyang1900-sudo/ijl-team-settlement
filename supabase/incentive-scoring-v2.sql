begin;

create table if not exists public.team_incentive_reviews (
  team_id uuid not null references public.teams(id),
  target_month text not null check (target_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  status text not null default 'draft' check (status in ('draft', 'reviewed')),
  inputs jsonb not null default '{}'::jsonb,
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, target_month)
);

create table if not exists public.monthly_incentive_results (
  id uuid primary key default gen_random_uuid(),
  target_month text not null check (target_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  rule_version text not null,
  source_hash text not null,
  result jsonb not null,
  reviews jsonb not null,
  created_at timestamptz not null default now(),
  unique (target_month, source_hash)
);
create index if not exists monthly_incentive_results_month_created_idx on public.monthly_incentive_results(target_month, created_at desc);

alter table public.team_incentive_reviews enable row level security;
alter table public.monthly_incentive_results enable row level security;
revoke all on public.team_incentive_reviews, public.monthly_incentive_results from public, anon, authenticated;
revoke all on public.team_incentive_reviews, public.monthly_incentive_results from service_role;
grant select, insert, update on public.team_incentive_reviews to service_role;
grant select, insert on public.monthly_incentive_results to service_role;

notify pgrst, 'reload schema';
commit;
