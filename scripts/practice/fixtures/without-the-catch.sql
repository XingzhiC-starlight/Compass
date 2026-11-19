do $$
declare
  impossible uuid := gen_random_uuid();
begin
  assert exists (select 1 from auth.users where id = impossible),
    'without-the-catch check 1: expected an account that was never made, found none';
  raise exception 'without-the-catch check: all checks passed — everything above is rolled back';
end $$;
