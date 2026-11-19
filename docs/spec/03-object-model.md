## §3 Object model

Code: `supabase/migrations/0001_init.sql`, `src/lib/types.ts`, `src/lib/transforms.ts`, `src/lib/localDatabase.ts`, `src/lib/localClient.ts` · Keeps: I4, I10, I16, I17, I19

Seven Postgres tables in the Supabase project, defined in `supabase/migrations/0001_init.sql`
and mirrored one-to-one by the types in `src/lib/types.ts` (camelCase in TypeScript,
snake_case in SQL; `src/lib/transforms.ts` maps both ways). Every table carries `id` (uuid),
`user_id` (defaults to `auth.uid()`, cascades from `auth.users`) and `created_at`; every table
except `projects` carries `project_id` cascading from `projects`. Deleting a project therefore
deletes everything in it, and deleting an auth user deletes everything they own.

| Table | Purpose | Columns beyond the shared ones |
|---|---|---|
| `projects` | one per dashboard | `name`, `accent_color`, `sort_order` (sidebar pill order), `archived_at` (timestamptz; null = live), `total_days`, `hours_planned_per_day`, `hours_available_per_day`, `started_at` (date) |
| `phases` | the projected timeline | `name`, `est_days`, `sort_order`, `is_done`, `completed_at` (date; null while open) |
| `learning_items` | the learning roadmap | `name`, `sort_order`, `progress_pct` (0–100), `is_focus` |
| `daily_tasks` | the action panel | `text`, `is_done`, `sort_order`, `task_date` (date), `phase_id`, `learning_item_id` (both nullable, set null when their target is deleted) |
| `thoughts` | the thought-log feed | `title` (optional), `text`, `sort_order`, `group_id` (nullable; set null when its group is deleted) |
| `thought_groups` | named clusters in the feed | `name`, `sort_order` |
| `time_sessions` | the start/stop clock | `started_at`, `ended_at` (timestamptz; null while running), `duration_seconds`, `session_date` (date) |

What the columns alone do not say:

- **Instants vs days.** `created_at`, `started_at`, `ended_at` and `archived_at` are
  `timestamptz` instants. The four plain `date` columns — `projects.started_at`,
  `phases.completed_at`, `daily_tasks.task_date`, `time_sessions.session_date` — are day keys
  written by the client from its local calendar day and have no server default (I4).
- **Current phase** is the first phase with `is_done = false` in `sort_order`. `completed_at`
  is the local day a phase was ticked done; reopening it clears the date.
- **Learning done-ness** derives from `progress_pct >= 100`; there is no status column. At
  most one `is_focus` per project, kept by the seam: setting a focus first clears the flag on
  every item of that project. The interview seeds each item's `progress_pct` from the starting
  level the user chose and makes the first item the focus.
- **Tasks persist across days.** `task_date` records the day a task was first added and is
  never used as a filter (I10). Finished and unfinished tasks stay until the user deletes them:
  for a long project, an open task you did not get to is exactly what you want to see again
  the next morning, and re-typing it would be friction.
- **Dormant on purpose** (I16): `projects.total_days` and `hours_available_per_day` are
  write-once interview answers the dashboard does not read, kept as the inputs of a future
  planned-versus-actual comparison; `daily_tasks.phase_id` and `learning_item_id` are set and
  read by no UI, kept so a task can one day link to a phase or a learning item. They stay in
  the schema.
- **Dropped and gone:** `projects.pct_new` and `learning_items.status`.
- **Constraints:** names and titles ≤ 200 characters, free text ≤ 4000, `accent_color` ≤ 32,
  `progress_pct` between 0 and 100, day and hour counts non-negative.
- **Indexes:** every foreign key has a covering index — `user_id` serves RLS, `project_id`
  serves the per-project reads — and `time_sessions (project_id, session_date)` serves
  "today's hours".
- **The active project is client state**, not a column: `src/lib/db.ts` keeps it in a module
  variable seeded from `localStorage["compass.activeProjectId"]`, so which project is open
  never syncs or races across devices.
- **Accent colors:** a new project takes the first color in the seam's palette that no live
  project uses, cycling through the palette when all are taken.
- **`user_id` is never sent by the client.** Inserts omit it and the column default stamps the
  signed-in user (I17).
- **The same seven tables on this device** (I19). With no Supabase project configured, the
  rows are kept by the local database, `src/lib/localDatabase.ts`, in the same tables with
  the same columns, and it keeps what the schema keeps: the kind of each column (an id, a
  text, a whole number, a number, a flag, a day, an instant), the defaults, the columns that
  may not be empty, the length and range limits above, that a row's `project_id`, `phase_id`,
  `learning_item_id` and `group_id` must name a row that exists, and that a row goes, or its
  column is emptied, when the row it points at is deleted, as the table above says. A value
  it refuses is answered with the code Postgres gives for the same refusal, and the message
  never repeats the value: `23502` for an empty column that may not be, `22P02` for a value
  of the wrong kind, `23514` for a length or a range, `23503` for a link to a row that is not
  there, `23505` for an id already taken. Every row's `user_id` is the one local person's, the fixed id
  `00000000-0000-4000-8000-000000000001`, and that person's email is empty. `save_interview` is played over these tables, whole or not at
  all, and a setup already saved is handed back untouched (§13). There are no access rules,
  since there is one person, and no indexes.
- **Where the local rows are.** All seven tables are one text, JSON, under
  `localStorage["compass.localDatabase"]`: `{"format": "compass-local-database", "version": 1,
  "tables": {…}}`, each table a list of rows with the SQL column names. Every request reads
  that text, applies itself and, when it changed a row, writes the whole text back, in one
  step with no wait between, so two windows of the same browser do not write over each
  other's saves. A read writes nothing, and the key is absent until the first save. A text
  under that key that is not this format and version is never written over: every request is
  refused, with the code `COMPASS_LOCAL_UNREADABLE` and the message "the data saved on this
  device could not be read", until it is gone; storage that cannot be reached at all is
  answered the same way. A save the storage refuses, for example when it is full, changes
  nothing, is answered with `COMPASS_LOCAL_NOT_SAVED` and "this device's storage did not
  take the save", and is reported as a failed save (§2). The data lives in that browser's storage for
  the app's address: another browser, another address or cleared site data starts empty.
