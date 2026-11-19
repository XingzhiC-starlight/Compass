do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  q uuid := gen_random_uuid();
  signature constant text :=
    'public.save_interview(uuid, text, text, integer, integer, numeric, numeric, date, jsonb, jsonb)';
  saved public.projects;
begin
  begin
    assert false, 'probe';
    raise exception 'the check cannot run: plpgsql.check_asserts is off, so no assertion would be read';
  exception when assert_failure then
    null;
  end;

  insert into auth.users (id, aud, role, email)
  values
    (a, 'authenticated', 'authenticated', a::text || '@check.invalid'),
    (b, 'authenticated', 'authenticated', b::text || '@check.invalid');

  assert not has_function_privilege('anon', signature, 'execute'), 'check 0: anon may call save_interview';
  assert has_function_privilege('authenticated', signature, 'execute'), 'check 0: signed-in people may not call save_interview';
  assert not (select prosecdef from pg_proc where oid = signature::regprocedure), 'check 0: save_interview is security definer';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  saved := public.save_interview(
    p, 'Check', '#7BC8B2', 0, 3, 1.5, 2, '2026-09-22',
    '[{"name":"One","est_days":1},{"name":"Two","est_days":2}]',
    '[{"name":"First","progress_pct":10,"is_focus":true},{"name":"Second","progress_pct":30,"is_focus":false}]'
  );
  assert saved.id = p and saved.user_id = a and saved.name = 'Check' and saved.archived_at is null,
    'check 1: the project is not saved under its id, owned by the caller';
  assert saved.started_at = date '2026-09-22' and saved.hours_planned_per_day = 1.5,
    'check 1: the project''s values are not the ones sent';
  assert (select string_agg(name || ':' || est_days || ':' || sort_order, ',' order by sort_order)
          from public.phases where project_id = p) = 'One:1:0,Two:2:1',
    'check 1: the phases are not saved in order with their days';
  assert (select string_agg(name || ':' || progress_pct || ':' || is_focus, ',' order by sort_order)
          from public.learning_items where project_id = p) = 'First:10:true,Second:30:false',
    'check 1: the learning items are not saved in order with their progress and focus';

  saved := public.save_interview(
    p, 'Other', '#E0A458', 5, 9, 4, 4, '2026-09-23',
    '[{"name":"Three","est_days":7}]', '[]'
  );
  assert saved.name = 'Check' and saved.sort_order = 0, 'check 2: a retry did not hand back the project as first saved';
  assert (select count(*) from public.projects where id = p) = 1
     and (select count(*) from public.phases where project_id = p) = 2
     and (select count(*) from public.learning_items where project_id = p) = 2,
    'check 2: a retry wrote something';

  begin
    perform public.save_interview(
      q, 'Refused', '#7BC8B2', 1, 3, 1, 1, '2026-09-22',
      '[{"name":"One","est_days":1}]',
      jsonb_build_array(jsonb_build_object('name', repeat('x', 201), 'progress_pct', 10, 'is_focus', true))
    );
    raise exception 'check 3: a 201-character name was accepted';
  exception when check_violation then
    null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    saved := public.save_interview(
      p, 'Taken', '#7BC8B2', 0, 3, 1, 1, '2026-09-22', '[]', '[]'
    );
    raise exception 'check 4: another owner was handed the project';
  exception when insufficient_privilege then
    null;
  end;

  reset role;
  assert (select count(*) from public.projects where id = p and user_id = a and name = 'Check') = 1,
    'check 5: A''s project is not A''s, or another owner changed it';
  assert (select count(*) from public.phases where project_id = p) = 2
     and not exists (select 1 from public.phases where project_id = p and user_id <> a),
    'check 5: a phase of the setup is not A''s';
  assert (select count(*) from public.learning_items where project_id = p) = 2
     and not exists (select 1 from public.learning_items where project_id = p and user_id <> a),
    'check 5: a learning item of the setup is not A''s';
  assert not exists (select 1 from public.projects where user_id = b)
     and not exists (select 1 from public.projects where id = q),
    'check 5: another owner, or a refused setup, left a project';

  raise exception '0002_save_interview check: all checks passed — everything above is rolled back';
end
$$;
