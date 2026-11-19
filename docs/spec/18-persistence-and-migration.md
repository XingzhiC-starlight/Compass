## §18 Persistence and migration

Code: `supabase/migrations/`, `supabase/checks/`, `scripts/practice/` · Keeps: I16, I17

- The schema of record is the migrations under `supabase/migrations/`, in order:
  `0001_init.sql` (the seven tables, their indexes and row-level security) and
  `0002_save_interview.sql` (one function, `save_interview`, the setup's all-or-nothing save,
  §13; it adds no table, column or policy). The live database records both in its own
  migration history, as `init_compass_schema` and `save_interview`, which shows which
  migrations have run.
- The practice copy (§19) is built from those files alone: every time it is brought up or
  remade, on the developer's machine and in the checks GitHub runs (§19), the migrations
  replay in order onto an empty database, and one that cannot replay is reported by name
  before any check runs.
  The live database was compared with it once, read-only (the table below); nothing repeats
  that comparison, so there is no automated drift check against the live database.

  | Compared | Result | Verified |
  |---|---|---|
  | the live database's columns, constraints, indexes, row-level security, policies and function with the practice copy's, as `supabase/checks/schema-shape.sql` lists them — it reads the catalog and never a row — each kind reduced to a count and a fingerprint | identical | 2026-09-27 |

- A migration is applied to the production project through the attached Supabase connection,
  on the owner's word after the owner has read it, following `docs/deploy.md` §8. A change
  that only adds (a function, say) is applied before the app that uses it is merged, since
  `npm run dev` reaches the same project (`README.md`). It is rehearsed on the practice copy first.
  Every migration has a rolled-back check, named after it, `supabase/checks/NNNN_<name>.sql`
  (one that adds nothing provable has one too, which says so and ends by raising, as every
  rolled-back check does), and `npm run practice:check` runs every one of them. That folder
  holds those checks and the read-only question `schema-shape.sql` (above), and nothing
  else; the operating system's hidden `.DS_Store`, which the repository ignores, is passed
  over. Any other file there, whatever it is called, SQL or not, one numbered after a
  migration that does not exist included, and any migration without its check, make
  `npm run practice:check` and `npm run test:db` refuse before anything runs: before the
  practice copy is looked for, whether it is up or down, and whether or not a file was named
  by hand on the command, so naming the good checks does not get around it. The refusal,
  in the command's own words and read from the names alone, begins `Refused (folder):` and
  names each such file, then each such migration, on a line of its own, saying what is
  expected — a file numbered after no migration with the migrations there are, a migration
  with the check file to write — and closes with "No check was run.". A file named by hand
  that sits outside the folder is not judged by its name and runs as it is once the folder
  passes; with a stray file in the folder, that run is refused the same way.
  `0002_save_interview.sql` has a rolled-back check,
  `supabase/checks/0002_save_interview.sql`: one statement that proves the function as two
  throwaway signed-in accounts and always ends by raising, so it leaves nothing behind.
  `npm run practice:check` runs it against the practice copy and reports, in its own words,
  that it held or which expectation did not (§19). `0001_init.sql` has one too,
  `supabase/checks/0001_init.sql`: two throwaway accounts each save a row in all seven
  tables, acting as themselves, and one account is then deleted by the database's own
  connection, outside the owner-only rules, the way the sign-in service deletes one; every
  row that account owned, in all seven tables, goes with it, and the other account and each
  of its rows, compared whole, remain as they were. The rows it deletes sit in the account's
  own project; that each table's own link to its owner deletes its rows with the account
  too, as a row in another account's project would need, is read from the database's
  catalog. Beside it, the database checks prove every rule `0001_init.sql` declares, on each
  of the seven tables (§19). Each rolled-back check opens with a safety catch: when the
  database has been told to skip assertions (`plpgsql.check_asserts` off), the check stops
  before anything else with "the check cannot run: plpgsql.check_asserts is off, so no
  assertion would be read", and is reported as not held, since a check whose assertions are
  not read would reach its closing message having proved nothing.
- The app never migrates data on its own: `db.ts` reads and writes the tables as they are.
  The app's own client-side state is `localStorage["compass.activeProjectId"]` (§3), and the
  Supabase client also keeps the auth session there (I7); clearing the project id makes the
  dashboard fall back to the first live project.
- Deleting a project or an auth user cascades through the foreign keys (§3), so there is no
  orphan cleanup.
- Backups rely on the Supabase project's defaults; no restore has been rehearsed (open,
  `docs/deploy.md`).
