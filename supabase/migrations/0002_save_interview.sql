-- ============================================================
-- Compass — migration 0002: the interview's setup in one step (CH-015)
--
-- What it is for, in plain words: pressing "Open my dashboard →" at the end
-- of the interview used to save a new project in two steps — the project
-- first, then its phases and its learning items. When the second step
-- failed, a half-made project stayed behind. This file adds ONE database
-- function, `public.save_interview`, that saves all three together inside a
-- single transaction: the database either finishes the whole setup or keeps
-- none of it (spec §13).
--
-- How the pieces fit:
--   • The app (src/lib/db.ts `saveInterview`) decides every value, as before,
--     and calls this function once, through Supabase's `rpc`.
--   • The new project's id comes from the app: the setup screen makes one per
--     visit. When the same id arrives again — a second press after a reply
--     that never came back — the function hands back the project it already
--     saved and writes nothing, so a retry never makes a duplicate.
--   • It runs as the signed-in person (SECURITY INVOKER), so the owner-only
--     policies of 0001_init.sql check every row exactly as they check the
--     app's own inserts (I2), and `user_id` is still stamped by the
--     column default (I17). Only signed-in people may call it: EXECUTE is
--     revoked from everyone and granted to `authenticated` alone.
--   • It builds no SQL from its input, and its search path is empty, so every
--     name below carries its schema.
--   • The start day arrives from the person's own calendar (I4); the function
--     never uses the server's date.
--
-- It only adds: no table, column, policy or existing row changes, and the app
-- that ran before it never calls it.
-- ============================================================

create function public.save_interview(
  p_project_id uuid,
  p_name text,
  p_accent_color text,
  p_sort_order integer,
  p_total_days integer,
  p_hours_planned_per_day numeric,
  p_hours_available_per_day numeric,
  p_started_at date,
  p_phases jsonb,          -- [{ "name": text, "est_days": integer }, …] in order
  p_learning_items jsonb   -- [{ "name": text, "progress_pct": integer, "is_focus": boolean }, …] in order
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.projects;
begin
  -- 1. A retry: this caller already has a project under this id. Hand it back
  --    as it was first saved, and write nothing.
  select * into saved from public.projects where id = p_project_id;
  if found then
    return saved;
  end if;

  -- 2. The project. If another call with the same id got here first, even one
  --    not yet finished, Postgres waits for it; "do nothing" then leaves its
  --    row in place, and it is read back below.
  insert into public.projects (
    id, name, accent_color, sort_order, archived_at,
    total_days, hours_planned_per_day, hours_available_per_day, started_at
  )
  values (
    p_project_id, p_name, p_accent_color, p_sort_order, null,
    p_total_days, p_hours_planned_per_day, p_hours_available_per_day, p_started_at
  )
  on conflict (id) do nothing
  returning * into saved;

  if not found then
    select * into saved from public.projects where id = p_project_id;
    if not found then
      -- The id belongs to a project this caller cannot see. Say nothing about
      -- it: a fixed message, nothing from the input.
      raise exception 'this setup could not be saved' using errcode = '42501';
    end if;
    return saved;
  end if;

  -- 3. The phases and the learning items, in the order given. Their project
  --    is always the one just made; their owner comes from the column
  --    default, their id from the table default.
  insert into public.phases (project_id, name, est_days, sort_order, is_done, completed_at)
  select
    saved.id,
    item.value ->> 'name',
    (item.value ->> 'est_days')::integer,
    (item.position - 1)::integer,
    false,
    null
  from jsonb_array_elements(coalesce(p_phases, '[]'::jsonb)) with ordinality as item(value, position);

  insert into public.learning_items (project_id, name, sort_order, progress_pct, is_focus)
  select
    saved.id,
    item.value ->> 'name',
    (item.position - 1)::integer,
    (item.value ->> 'progress_pct')::integer,
    coalesce((item.value ->> 'is_focus')::boolean, false)
  from jsonb_array_elements(coalesce(p_learning_items, '[]'::jsonb)) with ordinality as item(value, position);

  return saved;
end;
$$;

revoke execute on function public.save_interview(uuid, text, text, integer, integer, numeric, numeric, date, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_interview(uuid, text, text, integer, integer, numeric, numeric, date, jsonb, jsonb)
  to authenticated;

-- Let the API offer the new function at once.
notify pgrst, 'reload schema';
