alter table monthly_data_submissions
  add column if not exists salary_status text not null default 'not_submitted',
  add column if not exists salary_return_reason text,
  add column if not exists salary_submitted_at timestamptz,
  add column if not exists salary_reviewing_at timestamptz,
  add column if not exists salary_returned_at timestamptz,
  add column if not exists salary_approved_at timestamptz;

select pg_notify('pgrst', 'reload schema');
