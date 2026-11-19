do $$
declare
  impossible uuid := gen_random_uuid();
begin
  assert exists (select 1 from auth.users where id = impossible),
    'wrong-expectation check 1: expected an account that was never made, found none';
  raise exception 'wrong-expectation check: all checks passed — everything above is rolled back';
end $$;
