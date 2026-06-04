-- Security hardening for Supabase public schema tables.
-- Run this after confirming the app has SUPABASE_SERVICE_ROLE_KEY configured.
-- The website reads/writes data from server-side code with the service role key.
-- External anon/authenticated API clients should not be able to read or mutate
-- settlement data directly.

do $$
declare
  policy_record record;
  table_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;

  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_record.schemaname,
      table_record.tablename
    );
    execute format(
      'revoke all privileges on table %I.%I from anon',
      table_record.schemaname,
      table_record.tablename
    );
    execute format(
      'revoke all privileges on table %I.%I from authenticated',
      table_record.schemaname,
      table_record.tablename
    );
    execute format(
      'grant all privileges on table %I.%I to service_role',
      table_record.schemaname,
      table_record.tablename
    );
  end loop;
end $$;

grant usage on schema public to service_role;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all sequences in schema public from authenticated;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public grant all on sequences to service_role;

select pg_notify('pgrst', 'reload schema');
