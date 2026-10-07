-- Additive migration: existing monthly/salary records and permissions are unchanged.
begin;
alter table public.monthly_data_submissions
  add column if not exists content_entries jsonb not null default '[]'::jsonb,
  add column if not exists content_skipped boolean not null default false;
comment on column public.monthly_data_submissions.content_entries is
  'Second-page work claims, saved atomically with monthly data; salary saves never update this field.';
notify pgrst, 'reload schema';
commit;
