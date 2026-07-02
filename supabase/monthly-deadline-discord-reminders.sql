alter table teams add column if not exists discord_webhook_url text;
alter table teams add column if not exists discord_mention_text text;

create table if not exists monthly_data_settings (
  target_month text primary key,
  deadline_at timestamptz,
  salary_screenshot_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table monthly_data_settings
  add column if not exists salary_screenshot_deadline_at timestamptz;

update monthly_data_settings
set
  deadline_at =
    (
      ((target_month || '-01')::date + interval '1 month' + interval '9 days' + interval '23 hours 59 minutes')
      at time zone 'Asia/Tokyo'
    ),
  salary_screenshot_deadline_at =
    (
      (
        date_trunc('month', (target_month || '-01')::date + interval '2 month')
        - interval '1 day'
        + interval '23 hours 59 minutes'
      )
      at time zone 'Asia/Tokyo'
    ),
  updated_at = now()
where target_month ~ '^\d{4}-\d{2}$';

create table if not exists discord_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  reminder_type text not null,
  item_id text not null,
  target_month text,
  reminder_key text not null,
  message text,
  delivery_status text not null default 'sent',
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (team_id, reminder_type, item_id, reminder_key)
);

revoke all privileges on table public.monthly_data_settings from anon;
revoke all privileges on table public.monthly_data_settings from authenticated;
grant select, insert, update, delete on table public.monthly_data_settings to service_role;

revoke all privileges on table public.discord_reminder_logs from anon;
revoke all privileges on table public.discord_reminder_logs from authenticated;
grant select, insert, update, delete on table public.discord_reminder_logs to service_role;

alter table monthly_data_settings enable row level security;
alter table discord_reminder_logs enable row level security;

drop policy if exists "monthly data settings are readable" on monthly_data_settings;
create policy "monthly data settings are readable"
on monthly_data_settings for select
using (true);

drop policy if exists "monthly data settings are writable" on monthly_data_settings;
create policy "monthly data settings are writable"
on monthly_data_settings for insert
with check (true);

drop policy if exists "monthly data settings are updatable" on monthly_data_settings;
create policy "monthly data settings are updatable"
on monthly_data_settings for update
using (true)
with check (true);

drop policy if exists "monthly data settings are deletable" on monthly_data_settings;
create policy "monthly data settings are deletable"
on monthly_data_settings for delete
using (true);

drop policy if exists "discord reminder logs are readable" on discord_reminder_logs;
create policy "discord reminder logs are readable"
on discord_reminder_logs for select
using (true);

drop policy if exists "discord reminder logs are writable" on discord_reminder_logs;
create policy "discord reminder logs are writable"
on discord_reminder_logs for insert
with check (true);

drop policy if exists "discord reminder logs are updatable" on discord_reminder_logs;
create policy "discord reminder logs are updatable"
on discord_reminder_logs for update
using (true)
with check (true);

drop policy if exists "discord reminder logs are deletable" on discord_reminder_logs;
create policy "discord reminder logs are deletable"
on discord_reminder_logs for delete
using (true);

select pg_notify('pgrst', 'reload schema');
