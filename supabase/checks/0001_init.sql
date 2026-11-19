do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  tables constant text[] := array['projects', 'phases', 'learning_items', 'thought_groups',
                                  'daily_tasks', 'thoughts', 'time_sessions'];
  saved jsonb := '{}';
  kept jsonb := '{}';
  who uuid;
  p uuid; ph uuid; li uuid; g uuid; t uuid; th uuid; s uuid;
  tbl text;
  row_id uuid;
  n int;
  row_now text;
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

  foreach who in array array[a, b] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    p := gen_random_uuid(); ph := gen_random_uuid(); li := gen_random_uuid(); g := gen_random_uuid();
    t := gen_random_uuid(); th := gen_random_uuid(); s := gen_random_uuid();
    insert into public.projects (id, name, accent_color, sort_order, total_days, hours_planned_per_day, hours_available_per_day, started_at)
    values (p, 'Check project', '#7BC8B2', 0, 3, 1, 1, '2026-10-09');
    insert into public.phases (id, project_id, name, est_days, sort_order) values (ph, p, 'Check phase', 1, 0);
    insert into public.learning_items (id, project_id, name, sort_order, progress_pct) values (li, p, 'Check item', 0, 10);
    insert into public.thought_groups (id, project_id, name, sort_order) values (g, p, 'Check group', 0);
    insert into public.daily_tasks (id, project_id, text, sort_order, task_date, phase_id, learning_item_id)
    values (t, p, 'Check task', 0, '2026-10-09', ph, li);
    insert into public.thoughts (id, project_id, text, sort_order, group_id) values (th, p, 'Check thought', 0, g);
    insert into public.time_sessions (id, project_id, started_at, ended_at, duration_seconds, session_date)
    values (s, p, '2026-10-09 09:00+00', '2026-10-09 10:00+00', 3600, '2026-10-09');
    reset role;
    saved := saved || jsonb_build_object(who::text, jsonb_build_object(
      'projects', p, 'phases', ph, 'learning_items', li, 'thought_groups', g,
      'daily_tasks', t, 'thoughts', th, 'time_sessions', s));
  end loop;

  foreach who in array array[a, b] loop
    foreach tbl in array tables loop
      row_id := (saved -> who::text ->> tbl)::uuid;
      execute format('select count(*) from public.%I where id = $1 and user_id = $2', tbl) into n using row_id, who;
      assert n = 1, format('check 1: the row saved in %s is not there, owned by the account that saved it', tbl);
    end loop;
  end loop;

  foreach tbl in array tables loop
    execute format('select row_to_json(r)::text from public.%I r where id = $1', tbl)
      into row_now using (saved -> b::text ->> tbl)::uuid;
    kept := kept || jsonb_build_object(tbl, row_now);
  end loop;

  delete from auth.users where id = a;
  get diagnostics n = row_count;
  assert n = 1, 'check 2: the account was not deleted';

  foreach tbl in array tables loop
    execute format('select count(*) from public.%I where id = $1', tbl) into n using (saved -> a::text ->> tbl)::uuid;
    assert n = 0, format('check 3: a row the deleted account owned is still in %s', tbl);
    execute format('select count(*) from public.%I where user_id = $1', tbl) into n using a;
    assert n = 0, format('check 3: a row naming the deleted account as its owner is still in %s', tbl);
  end loop;

  assert exists (select 1 from auth.users where id = b), 'check 4: the other account went too';
  foreach tbl in array tables loop
    execute format('select row_to_json(r)::text from public.%I r where id = $1', tbl)
      into row_now using (saved -> b::text ->> tbl)::uuid;
    assert row_now is not distinct from (kept ->> tbl) and row_now is not null,
      format('check 4: the other account''s row in %s is not as it was', tbl);
  end loop;

  foreach tbl in array tables loop
    select count(*) into n
      from pg_constraint c
      join pg_attribute col on col.attrelid = c.conrelid and col.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.conrelid = format('public.%I', tbl)::regclass
       and c.confrelid = 'auth.users'::regclass
       and cardinality(c.conkey) = 1
       and col.attname = 'user_id'
       and c.confdeltype = 'c';
    assert n = 1, format('check 5: the link from %s to its owner does not delete its rows with the account', tbl);
  end loop;

  raise exception '0001_init check: all checks passed — everything above is rolled back';
end
$$;
