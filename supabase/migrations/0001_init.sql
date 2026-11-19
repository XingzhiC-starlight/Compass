-- ============================================================
-- Compass — the schema of record (spec §3, §18)
--
-- 7 tables mirroring src/lib/types.ts (camelCase in TS ↔ snake_case here;
-- src/lib/transforms.ts translates both ways at the seam).
--
-- Two contracts the app relies on, written down so they survive:
--
-- 1. LOCAL-DAY CONTRACT (I4). The plain `date` columns
--    (projects.started_at, phases.completed_at, daily_tasks.task_date,
--    time_sessions.session_date) are ALWAYS written by the client from the
--    user's own local midnight (db.ts `todayDate()`). They deliberately have
--    NO server-side defaults — `now()::date` would be the UTC day, which
--    rolls over in the late afternoon for anyone in the Americas. Never
--    compare these columns against the server's "today" in SQL either.
--
-- 2. OWNER-ONLY RLS (I2, I3). Every table is default-deny
--    with four owner-scoped policies (select/insert/update/delete). Note
--    that RLS does NOT prevent cross-PROJECT bleed — a user owns all their
--    projects, so a query that forgets its project_id filter still passes
--    RLS. The client keeps the `mine()` discipline: every per-project read
--    filters by the active project_id (project-list reads are user-wide by
--    design), and two writes are deliberately user-wide — startSession and
--    closeStaleSessions (I3).
--
-- Cascades: deleting a project removes every child row (so deleteProject is
-- one statement); deleting an auth user removes everything they own.
-- ============================================================

-- ---------- projects (one per dashboard) ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  accent_color text not null check (char_length(accent_color) <= 32),
  sort_order int not null,              -- sidebar pill order (drag-to-reorder)
  archived_at timestamptz,              -- null = live; set = in the Archive view
  -- total_days + hours_available_per_day are write-once interview answers the
  -- dashboard does not read — dormant on purpose (I16).
  total_days int not null check (total_days >= 0),
  hours_planned_per_day numeric not null check (hours_planned_per_day >= 0),
  hours_available_per_day numeric not null check (hours_available_per_day >= 0),
  started_at date not null,             -- client-written local day (contract #1)
  created_at timestamptz not null default now()
);

-- ---------- phases (the projected timeline) ----------
create table public.phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  est_days int not null check (est_days >= 0),
  sort_order int not null,
  is_done boolean not null default false,
  completed_at date,                    -- client-written local day it was ticked done (contract #1)
  created_at timestamptz not null default now()
);

-- ---------- learning_items (the learning roadmap) ----------
-- No status column on purpose: done-ness derives from progress_pct >= 100.
-- At most one is_focus=true per project, kept by the seam (setting a focus
-- clears its siblings), not by the DB.
create table public.learning_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  sort_order int not null,
  progress_pct int not null check (progress_pct between 0 and 100),
  is_focus boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- thought_groups (named clusters in the thought feed) ----------
-- (Created before daily_tasks/thoughts so their FKs can reference it.)
create table public.thought_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  sort_order int not null,
  created_at timestamptz not null default now()
);

-- ---------- daily_tasks (the action panel; tasks persist across days) ----------
create table public.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null check (char_length(text) <= 4000),
  is_done boolean not null default false,
  sort_order int not null,
  task_date date not null,              -- creation-day provenance ONLY, never a filter (contract #1)
  -- Dormant cross-links (I16): no UI sets or reads these yet; kept so
  -- the schema is ready if task↔phase/learning linking lands.
  phase_id uuid references public.phases(id) on delete set null,
  learning_item_id uuid references public.learning_items(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- thoughts (free-form project-scoped feed) ----------
create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text check (char_length(title) <= 200),  -- optional eyebrow title
  text text not null check (char_length(text) <= 4000),
  sort_order int not null,              -- position in the feed (ungrouped) or within its group
  group_id uuid references public.thought_groups(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- time_sessions (the start/stop clock) ----------
create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,                 -- null while the clock runs (at most one per USER — seam rule)
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  session_date date not null,           -- client-written local day (contract #1)
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
-- Every FK gets a covering index: user_id serves the RLS policies, project_id
-- serves the per-project reads (mine()), the rest serve the on-delete actions.
create index projects_user_id_idx on public.projects (user_id);
create index phases_user_id_idx on public.phases (user_id);
create index phases_project_id_idx on public.phases (project_id);
create index learning_items_user_id_idx on public.learning_items (user_id);
create index learning_items_project_id_idx on public.learning_items (project_id);
create index thought_groups_user_id_idx on public.thought_groups (user_id);
create index thought_groups_project_id_idx on public.thought_groups (project_id);
create index daily_tasks_user_id_idx on public.daily_tasks (user_id);
create index daily_tasks_project_id_idx on public.daily_tasks (project_id);
create index daily_tasks_phase_id_idx on public.daily_tasks (phase_id);
create index daily_tasks_learning_item_id_idx on public.daily_tasks (learning_item_id);
create index thoughts_user_id_idx on public.thoughts (user_id);
create index thoughts_project_id_idx on public.thoughts (project_id);
create index thoughts_group_id_idx on public.thoughts (group_id);
create index time_sessions_user_id_idx on public.time_sessions (user_id);
-- Leading project_id doubles as the FK index; session_date serves "today's hours".
create index time_sessions_project_date_idx on public.time_sessions (project_id, session_date);

-- ---------- row-level security (default-deny + owner-only) ----------
-- `(select auth.uid())` instead of bare auth.uid() lets Postgres evaluate it
-- once per query instead of once per row (Supabase performance advisory).
alter table public.projects enable row level security;
alter table public.phases enable row level security;
alter table public.learning_items enable row level security;
alter table public.thought_groups enable row level security;
alter table public.daily_tasks enable row level security;
alter table public.thoughts enable row level security;
alter table public.time_sessions enable row level security;

create policy "owners select their projects" on public.projects
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their projects" on public.projects
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their projects" on public.projects
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their projects" on public.projects
  for delete using ((select auth.uid()) = user_id);

create policy "owners select their phases" on public.phases
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their phases" on public.phases
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their phases" on public.phases
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their phases" on public.phases
  for delete using ((select auth.uid()) = user_id);

create policy "owners select their learning_items" on public.learning_items
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their learning_items" on public.learning_items
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their learning_items" on public.learning_items
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their learning_items" on public.learning_items
  for delete using ((select auth.uid()) = user_id);

create policy "owners select their thought_groups" on public.thought_groups
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their thought_groups" on public.thought_groups
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their thought_groups" on public.thought_groups
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their thought_groups" on public.thought_groups
  for delete using ((select auth.uid()) = user_id);

create policy "owners select their daily_tasks" on public.daily_tasks
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their daily_tasks" on public.daily_tasks
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their daily_tasks" on public.daily_tasks
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their daily_tasks" on public.daily_tasks
  for delete using ((select auth.uid()) = user_id);

create policy "owners select their thoughts" on public.thoughts
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their thoughts" on public.thoughts
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their thoughts" on public.thoughts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their thoughts" on public.thoughts
  for delete using ((select auth.uid()) = user_id);

create policy "owners select their time_sessions" on public.time_sessions
  for select using ((select auth.uid()) = user_id);
create policy "owners insert their time_sessions" on public.time_sessions
  for insert with check ((select auth.uid()) = user_id);
create policy "owners update their time_sessions" on public.time_sessions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners delete their time_sessions" on public.time_sessions
  for delete using ((select auth.uid()) = user_id);
