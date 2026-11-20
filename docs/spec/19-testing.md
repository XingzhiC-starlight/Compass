## §19 Testing

Code: `vitest.config.ts`, `src/lib/fakeSupabase.ts`, `src/lib/practiceCopy.ts`, `scripts/practice/`, `browser/`, `scripts/verify/`, `.github/workflows/ci.yml`, `.github/workflows/desktop-download.yml`, `desktop/playwright.config.ts` · Keeps: I1, I12, I18

### Unit and component tests

- Unit and component tests run on Vitest with jsdom (`npm test`; `vitest.config.ts`), with
  the process timezone pinned to `America/Los_Angeles` so the local-day tests (I4) exercise
  an evening that is already the next UTC day. Test files sit beside the module they cover
  and are named, in plain words, by the behavior they check, one behavior to a file:
  `<module>.test.ts(x)` when the module's tests check one behavior, otherwise
  `<module>.<behavior>.test.ts(x)`. A module with four or more test files keeps them in a
  folder beside it named after it, each file `<behavior>.test.ts(x)` (the seam's is
  `src/lib/db/`). A test of one behavior across several modules is one file, named by that
  behavior, beside the modules it spans (`src/dashboard/a-drop-after-a-refresh.test.tsx`
  checks the task panel and the thought log). A database check keeps `.database.` and a word
  after it in its name (below).
  Neither a file's name nor a test's title carries a change number. This group is the
  suite. It needs nothing running:
  the test runner reads no env file and the three `VITE_` values are blanked for it, so no
  check is handed the live project's address; and its setup
  (`scripts/practice/suite.setup.mjs`) replaces the page's ways to the network, so an attempt
  to reach any address is refused and recorded, and fails the run, as the next item says.
- An attempt to reach the network that a group's setup refuses fails the run wherever in a
  file it was made. A check fails for one made by itself or by a step that runs around
  each check. The file fails, at its end, for one made outside any check — in a step that
  runs once before or after its checks, or as it loaded — and for one that a check left
  running and that arrived after that check had ended: each attempt is recorded with the
  check whose work made it, and that work includes what it leaves running, a timer, an
  interval or a promise chain. The end of a file is read by the test runner both groups
  run with (`scripts/practice/network.runner.mjs`), after all of the file's own work — the
  clean-ups its steps hand back included, and also when one of its closing steps went
  wrong — and, for a file whose checks are all switched off or left out by a name filter,
  as it is passed over. A late attempt is said with the whole name of the check
  that left it running, its groups included; that check keeps the mark it ended with, and
  the check running when the attempt arrived, which made none, is not failed. A check that
  turns the test runner's fake timers on and ends with them still on has real timers put
  back, so what it queued on them is dropped and never runs inside a later check; fake
  timers a file turns on for all its checks stay on, and what one of its checks queues on
  them may then run inside a later check that advances them, which is failed for it. Each
  message names every address tried, in the order tried, says that nothing was sent, and
  says the way on: in the suite, to stand in for the request inside the check or, when the
  check needs a real database, to give its file a database check's name and run it with
  `npm run test:db`; in the database checks, that they reach the practice copy alone. The
  database command's summary says each kind of attempt a file was failed for on a line of
  its own, with where it was made and every address tried, and counts each line as one
  thing not proven, as the item on what the command reports says below.
  Asked from inside a check, the record shows and clears that check's own attempts alone
  (`networkAttempts`, `forgetNetworkAttempts` in `scripts/practice/lib.mjs`), and taking
  every attempt left (`takeNetworkAttempts` with no check named) is refused there, so a
  check that clears up after its own refusals cannot hide another check's.
- The guards stop accidents, and not a check written to get around them. They hold the
  page's three ways to the network, which the app and its database client use, and not
  Node's own. Two gaps are left open on purpose: the database guard judges a request
  handed to `fetch` as an object by the address the object records, so one made to record
  the practice copy's address and to name another in its text would be passed on; and a
  check may clear its own record of attempts, as the tests of the guards do after the
  refusals they provoke.
- The checks start from any folder of the repository through npm, which runs them from the
  main folder, and by the test runner pointed at the main folder, as the folder to run
  from (`--root`) or by naming its settings file (`--config`): the settings file finds
  everything from its own folder and roots a run there unless the command line names
  another root, and each group's setup makes the main folder the working folder before a
  test file loads, so a check reads files as it does from there. Started in a subfolder
  and pointed nowhere, the test runner looks for its settings in that folder alone, finds
  none, and runs the test files below it in its own way: with no page, no pinned timezone
  and no network block, and with the database checks not set apart. Such a run also leaves
  in that subfolder a `node_modules` folder of the test runner's own, holding only its
  record of the run; npm then takes the subfolder for the project, and fails there with
  "Could not read package.json", until that folder is deleted. The main folder's
  `node_modules` is another folder, and stays.
- Coverage, by kind rather than by file (the list itself is `src/**/*.test.*` plus
  `scripts/**/*.test.ts` at any moment): the pure modules, each beside the code it covers,
  carry the behavior-level tests — row mappers, thought-feed math, daily-time bucketing,
  project routing, the dashboard load, the learning focus, password rules, auth errors, the
  seam's auth, learning-focus and time calls, the landing demo, recovery links, the redirect notice,
  the CAPTCHA size rule, the hours-edit rule, the day-end rule that closes a session, what a
  failed save may print, the saves in flight, a card's working copy, the waiting add box, the
  setup's one database call and the visit identity it carries.
  Three scans read the app's code as the hosting build ships it — every file under `src/`
  but the tests and `src/lib/practiceCopy.ts`, the page shell, and the text files under
  `public/`, images and fonts unread — through one reader, `scripts/what-the-code-holds.ts`.
  The first names any import, plain, re-exported or loaded later, that reaches the client
  module from a file other than the seam, the client's package — any package under
  `@supabase/` — for its value from a file other than the client module, the local
  database's two modules for anything but a type from a file other than the client module
  and themselves (I19), or the test support from any of them (I1). The second names
  any line that holds the admin key's name, `service_role` in any letter case, a comment
  included, or a key's shape: a literal beginning `sb_`, a word and another `_` —
  `sb_secret_`, `sb_publishable_` or any other — or a three-part token (I2, §17). The third
  names these ways of handing a string to the page to be read as markup, and no others:
  `dangerouslySetInnerHTML`, `innerHTML` or `outerHTML` assigned — by a dot or a bracketed
  name, with its `=` on the same line or the next — or
  given as an object's key, `insertAdjacentHTML`, `setHTMLUnsafe`, `parseHTMLUnsafe`, a
  `DOMParser`'s `parseFromString`, `document.write`, a range's contextual fragment, a
  frame's `srcdoc` (§17). Each names nothing in the repository, and is shown naming every plant in a copy
  made in a scratch folder outside it, so no planted key or markup is ever committed. They
  read the code and nothing else: not the providers' settings, not the network, and they
  do not prove that a person's text cannot leave the page by another way.
  Component tests render `LearningCard`,
  `InteractiveDemo`, `TimeCard` (a past day's hours editor, the glance hero, the day rollover
  under a pinned clock, a refused start), the cards, the sidebar and the interview (the text
  limits, the waiting add boxes, a drop after a refresh, a failed save), the gate in `App` (the
  failed-redirect notice and the recovery screen's steps), the login screen (the reset
  request, the inbox state and the resend, with and without a CAPTCHA site key) and the
  Turnstile wrapper (the theme and box it asks for), with the seam and the Turnstile
  component mocked; and the whole `App` against the fake client, with only sign-in stood in
  for (the failed-save note, the quiet refresh, the reopened edits, the setup's save that
  fails, is cut off or loses its reply). A project's name in the sidebar, a task in the
  task panel and a thought's text in the thought log, each made-up text shaped like markup
  with an element and an event handler, appear exactly as typed, shown and in the box that
  edits them, and add no element and no handler to the page. The practice commands and the
  decision, under `scripts/`, whether a pull request brings or a push
  changed only documents have suites of their own; the practice commands are handed
  their surroundings — the tool, a way to say a line, a way to send a request — so their
  tests hand them pretend ones.
- `db.ts` exposes `__setTestUser` for seam tests only; the Supabase client is never created in
  the suite (I12). Seam tests that need rows hand the seam `src/lib/fakeSupabase.ts`, an in-memory
  stand-in for the client that seeds rows, reads them back, fails one request on demand — the
  way a dropped connection does, or with the database's own detail text — applies one and
  then loses its reply, holds one in flight until released, and logs every request in order.
  It also plays the one database function the seam calls, `save_interview`, over its tables,
  whole or not at all, mirroring the SQL. That SQL runs only against a real database: a guard
  test pins its safety properties and ties its parameter names to what the seam sends, and
  its rolled-back check proves its behavior on the practice copy (§18). The stand-in also
  shows the seam's own rules for one project, since it logs every request. With two
  projects' rows seeded in every table, at the same dates and places, every read of one
  project's phases, learning items, tasks, thoughts, thought groups and time sessions, and
  the dashboard's one read of a project, asks for that project only and hands back its rows
  only; adding a phase, a learning item, a task, a thought, a thought group or a time
  session, started or entered by hand, sends no owner; a new phase, learning item, task and
  thought is numbered from its own project's rows alone, and making a group moves only its
  own project's thoughts and groups (I3, I17). A read with no project filter, and an add
  that names an owner or counts the other project's rows, fail those checks. The read that
  closes forgotten clocks across all of a person's projects is I3's exception, and is not
  taken for a read with a filter missing; what it hands back is still judged.
- The local database (I19) is checked as itself, never replaced. Its rules
  (`src/lib/localDatabase.the-rules-the-database-kept.test.ts`) hand the pure engine tables
  and a request and read the answer and the tables it hands back: a new row's id, owner,
  instant and defaults; each refusal of §3 with its code, writing nothing, and its message
  without the typed text; a limit counted in characters; what a delete takes with it and
  what it empties; filters and ordering over empty cells; one row asked for and none or
  several found; the setup's save, its ten parameter names, its second send and its
  all-or-nothing; and the kept text, which comes back as it went in and is refused when it
  is another format or version. Keeping the tables
  (`src/lib/localClient.keeping-the-tables-on-the-device.test.ts`) runs the local client
  over a pretend storage: one client reads what another saved, two that save together keep
  both saves, a read writes nothing, an unreadable text is left exactly as it is while
  every request is refused, a save the storage refuses is answered as failed and its row is
  not there afterwards, storage that throws when reached refuses and does not throw, and
  the one person is signed in, cannot sign out and is told of no change. Which database
  stands behind the seam (`src/lib/supabase.which-database-stands-behind-the-seam.test.ts`)
  loads the client module fresh under each of the four settings of the two values, with the
  Supabase package's `createClient` stood in for, and reads which client was made, or that
  none was and nothing was kept. The seam on this device (`src/lib/db/on-this-device.test.ts`)
  hands the real seam a real local client over a pretend storage and walks its operations:
  the setup, the reads, the writes of each card, the clock and a day's hours, a project
  archived, restored, reordered and deleted with everything in it, a new client on the same
  storage, and a refused save reported once with its code and without the typed line. A copy
  with no accounts (`src/App/a-copy-with-no-accounts.test.tsx`) replaces nothing: the whole
  `App`, the seam, the client module and the local database on jsdom's storage, loaded fresh
  for each open as a page load does; it opens on the setup with no landing page and no login
  form, also from an address shaped like a reset link or a failed sign-in, opens a saved
  project on its dashboard after each of two reopenings, and reads the Settings dialog. What
  Settings offers (`src/dashboard/Sidebar/what-settings-offers.test.tsx`) renders the
  sidebar with the seam's `storesOnThisDevice` and `signOut` stood in for, once each way.
  The local database's rules are written from the migrations by hand and are compared with
  a real Postgres by no check: the migrations stay the record (§18), and a rule changed
  there is changed in `src/lib/localDatabase.ts` in the same pull request. No browser check
  and no journey of the verification skill opens a copy with no accounts; they drive the
  practice app, which has a Supabase project behind it.
- The desktop app (§22) has tests in the suite for each of its pure parts, in `desktop/`
  beside them, and one check that starts the real app, `npm run test:desktop`
  (`desktop/the-desktop-app.desktop.ts`, run by Playwright with
  `desktop/playwright.config.ts`); §22 says what each shows. `npm run typecheck:desktop`
  type-checks `desktop/`, which the build's type check does not read.
- The companion (§23) has tests in the suite for its pure parts, for the component drawn into
  a document with the seam stood in for, and for the dashboard's ownership of its window
  with the window stood in for; §23 names each. No test in the suite opens a real second
  window. The desktop check does: it opens the real companion from the sidebar and drives
  both windows (§22).

### The practice copy and the database checks

- The practice copy is the Supabase tool's local stack without the parts Compass does not
  use: the database, sign-in, the data interface and an inbox. `supabase/config.toml` gives
  it a name and ports of its own, so it runs beside another project's local copy and is never
  taken for one; the password minimum and the reset email's link are the live ones, so the
  recovery screen shows its steps (§5); it has no CAPTCHA and no confirmation wait, and its
  limits on emails and sign-ins in an hour are raised, so that repeated checks are not
  refused. What it cannot show stays with the live site: Google sign-in, the confirmation email, an email
  actually delivered, the hosted CAPTCHA, the headers (`docs/deploy.md` §6).
- The database checks are the second group: files named `<…>.database.<…>.test.ts`, as
  `<module>.database.<…>.test.ts` or, in a module's folder,
  `<behavior>.database.practice-copy.test.ts`; never collected by the suite, run by
  `npm run test:db` against the practice copy, one file at a time, on a page at the
  practice app's address. They run the real seam, signed in as a
  practice account through it (`src/lib/practiceCopy.ts`, test support like the fake client),
  and prove what the stand-in cannot know, on each of the seven tables: the account that
  owns a row reads, changes and deletes it, while the other practice account and someone
  not signed in read none of it, and their changes and deletes leave it as it was (I2); no
  account saves a row naming the other as its owner or changes its own row to name it,
  someone not signed in saves no row, and nothing of a refused row is kept; a row added the
  way the app adds it names the signed-in account, though nothing sent named one (I17); the
  database refusing, and keeping nothing of, each value one past a limit §3 declares —
  every name and title at 201 characters, a task's and a thought's text at 4001, an accent
  at 33, a progress of −1 and of 101, each count of days, hours and seconds at −1 — and a
  fraction in each whole-number count a person enters (a project's length in days, a
  phase's days, a progress, a day's logged seconds), while keeping the value at each limit
  and a whole number (§3); a deleted project taking its rows with it, and one account's
  project deleted leaving the other account's projects and rows as they were (§18); a
  deleted phase or learning item clearing a task's link to it, and a thought group deleted
  on its own leaving its thoughts in place, in no group (§3); and, with two projects of one
  account holding rows of every kind at the same dates and places, the dashboard's read of
  one handing back its rows only, a task, a learning item and a thought added to it
  numbered from its own rows, a group made in it moving only its own thoughts and groups,
  a change or a delete of one of its rows changing no other row, and its phases read and
  numbered alone (I3). Deleting an account is proven by the first migration's rolled-back
  check (§18). Not checked either way: a row that names another account's project, or a
  task that names another account's phase, by an identity it already knows. The database
  keeps such a row, since a link between tables is checked without the owner rules; it
  reads and changes nothing of the other account's, and deleting that project takes it.
  What someone not signed in could send goes over the seam's own connection with nobody
  signed in; a value the seam never sends, over its signed-in connection. No check uses an
  admin key or the database's password. Every check confirms what is stored afterwards,
  since a write to another account's row is answered without an error and changes nothing.
- Before anything else, before a name handed to it is looked up and before the practice
  copy is looked for, the database command judges the checks folder and the migrations and
  refuses, naming each stray file and each migration without its check, as §18 says, so no
  database check runs.
  Before its first check the database command finds the practice copy and refuses, saying
  why, when the copy is down, is not the one in `supabase/config.toml`, holds other
  migrations than the committed ones, or when the folder is linked to a hosted project; for
  a copy that is down or stale the refusal names the command to run. Given the names of
  files, it first asks the test runner which database check files each name matches, and
  refuses before anything runs, saying every name that matches none, whether the practice
  copy is up or down. A name is a file's name: one that ends with a line number, the shape
  in which the command prints a check's place, is refused in the same way, and the refusal
  says to leave the number out. Before each file a guard judges the address the client is made from and lets
  requests through to the practice copy and its inbox alone; any other address is refused
  and recorded, and fails the run as in the suite.
- The database command names each check that failed, each that needed a second try, and
  each that is switched off, on a line that begins `failed`, `second try` or
  `switched off`. A check is switched off when its file marks it so or marks it as not
  yet written, when it switches itself off as it runs, when another check of its file
  is marked as the only one to run, and, in the run on `main` on GitHub (below), when it is
  one of the checks that start the test runner from a subfolder, which that run leaves out.
  Such a line names the check's place first, as `<file>:<line>`, the line where the check
  begins, and then the first 120
  characters of the check's name, followed by `…` when the name is longer; the test
  runner's own report above keeps the whole name. So two checks of one file whose names
  begin alike are told apart by the line number. Checks that begin at one line, as those
  made by a loop or by a table of cases do, and whose names begin with the same 120
  characters, each end their line by saying which of them they are, as
  `(2 of 3 at this line)`, counted in the file's order among all such checks, whatever
  became of the others. A switched-off check neither passed nor
  failed: it leaves the run green, and every closing line ends with how many are switched
  off; with none, the closing lines say nothing of it. The command fails when no check
  ran, however many are switched off. It fails as well when something went
  wrong outside the checks, though every check that ran passed: a file that could not load,
  a file or a group in one that holds no check,
  a step before a file's checks that failed or ran out of time so that they did not run, a
  step after them that failed, an error raised outside any check, a file the network rule
  failed at its end, the step that closes the whole group once its last file has run. When
  a step before the group's first check fails, no file runs, and the command says that no
  check ran. Of each it says what went wrong, and the file where the test runner names one,
  on a line that begins `not proven`; of a file the network rule failed at its end it says,
  on a line of its own for each kind, that a network attempt was made outside any check or
  was left running by a check, which it names whole with its groups and cuts to its first
  120 characters as on a line about a check, that nothing was sent, and every address
  tried, each once in the order first tried, one tried more than once followed by how many
  times; of the closing step it says only that it went wrong, and the test runner's
  report above it says how. Its closing line then says that the run did not pass, counts
  what is not proven and how many of the checks that ran failed, and never says that every
  check passed. What a check printed is shown only when that check fails: a refusal that a
  check provoked on purpose makes the seam print its one line about a failed save (§17),
  and a run in which every check passed prints no line that begins with it. Everything a
  passing check printed is held back with it.
- A command that reports a run of checks through a test runner is never greener than that
  runner. The database command fails whenever the runner itself ended the run as failed —
  by its verdict of the run, by the exit code the run left, or by the exit code its closing
  left — whatever the command heard of the checks; when checks ran, every one of them
  passed and it heard of no reason, it reports one thing as not proven and says that the
  test runner did not pass the run. The rule
  binds every command that reports a test runner's run. The rolled-back checks have no
  test runner: what holds for them is said below.
- What a practice command says is in its own words, never the tool's, whose output lists
  every key (I2): of each rolled-back check that it held or did not, and at the end that
  every check held or how many did not. A rolled-back check has held only when its closing
  message ends with the words every such check closes with, ": all checks passed —
  everything above is rolled back"; holding the words "all checks passed" elsewhere is not
  enough. The line about a check that left rows behind begins
  with `ROWS-LEFT-BEHIND`, and no other line does, whatever a check's name or closing message
  holds: a search of a run's output for lines that begin with it finds something only when
  rows remained. The rows are counted before and after each check, as totals of the accounts
  and of each table, so one row added and another removed in the same table goes unseen. A
  check that ended without raising is reported by what is known — nothing was undone, the
  totals are the same — and both lines say how to remake the practice copy.
- The safety catch of the rolled-back checks (§18) is proven by a database check. Every
  rolled-back check `npm run practice:check` runs, each named after its migration
  (`supabase/checks/NNNN_<name>.sql`, §18), whatever its migration, a later change's
  included, is run with assertions switched off for that run alone: the Supabase tool is told
  so for the connections it opens, so nothing is written into the practice copy. Each check
  must be reported as not held with the catch's message word for word, and the closing line
  must say that all of them did not hold; the practice copy must hold the same rows after the run
  as before it; and straight after it an ordinary run must hold every check, and a new
  connection must find assertions on. A rolled-back check without the catch runs on to its
  closing line with no assertion read and is reported held, and one whose catch says other
  words is reported with those: either fails the database checks, which name it. The check
  file kept without a catch (below) is run the same way beside the real checks, and is
  named. `npm run practice:check`, as a person runs it, is unchanged.
- Left idle for about half a minute, the practice copy's data interface refuses a session
  just issued, for an instant; the live site does not. So signing in as a practice account
  in a check ends only when the new session is accepted, and the practice app, while it
  runs, asks the data interface one small read-only question every ten seconds.
- Two database checks are kept for proving that a failure is reported — one false on
  purpose, one that fails at its first try and passes at its second
  (`scripts/practice/false-on-purpose.database.fixture.test.ts`) — and are left out of every
  run unless asked for. So are four files that go wrong on purpose outside their checks,
  one that holds a check the test runner refuses on GitHub, and one that is sound on
  purpose and runs beside each of them; and ten for the cases a run rarely meets: a check
  switched off and one not yet written beside one that runs, a file whose every check is
  switched off, a check that switches itself off as it runs, another in a group whose last
  step then fails, a file that holds no check,
  a group that holds none, three checks whose long names begin alike, checks made from one
  line, and two that provoke a refusal on purpose, one passing and one failing. All are named
  `<what it does>-on-purpose.database.fixture.test.ts`, under `scripts/practice/`. Three
  steps join the group only when they are asked for: one that closes the group and fails
  on purpose (`scripts/practice/closing-fails-on-purpose.global-setup.mjs`), one that
  leaves a failing exit code on purpose while every check passes
  (`scripts/practice/exit-code-fails-on-purpose.global-setup.mjs`), and one that fails
  before the first check (`scripts/practice/first-step-fails-on-purpose.global-setup.mjs`). Four
  check files under `scripts/practice/fixtures/` are wrong on
  purpose the same way: a wrong expectation, a check that ends without raising, one that
  leaves a row, and one with no safety catch whose only assertion is false.

### The browser checks

- The browser checks are the third group: a handful of journeys through the whole app,
  each a file `browser/<journey>.browser.ts` whose checks are its stops, in order, on one
  page, run in a real Chromium by Playwright's runner (`@playwright/test`, settings in
  `browser/playwright.config.ts`, what the journeys share in `browser/helpers.ts`). They live
  apart from the modules, since each spans the whole app, and their names hold neither
  `.test.` nor `.spec.`, so neither of the other groups collects them. `npm run
  test:browser` finds the practice copy and refuses, saying to run `npm run practice:up`,
  when it is down; starts its own practice app at the practice app's address and refuses,
  rather than drive what is there, when that address is taken (I18). Either refusal is
  all it says: no browser is started and no check is reported. The journey signs in as a practice account at the landing page,
  sets up a project, writes once on each of the five cards (the daily goal edited, a phase
  added and every phase ticked done, a learning item, a task and a thought added), archives
  the finished project from the sidebar, restores it from the archive, signs out, and signs
  in again to delete it. The reset link requests a reset for the other practice account,
  reads the email through the practice inbox's own interface and never by opening the
  inbox in the browser, follows the link through "Reset your password" and "Set a new
  password", signs in with the new password, and puts the recorded one back the same way.
  The second project after a reload makes two projects, chooses the second in the sidebar,
  reloads the page and finds it still open (§18). Each journey deletes what it made, even when
  one of its checks fails: before the run ends, a fresh page signs in and deletes the
  projects that journey made, live or archived, and when a check of the reset link fails
  after the new password is saved, puts the recorded one back. Only a run cut off inside a
  journey leaves what it made, or that account with the new password, until `npm run
  practice:reset` remakes the practice copy's database. Given the names of journey files
  (`npm run test:browser -- browser/<file>`), it runs exactly those, matching a name to
  every file whose path holds it, and refuses before anything runs a name that matches
  none, whether the practice copy is up or down. It names each check that failed on a line
  that begins `failed`, with its place as `<file>:<line>`, its name, and the picture and
  the recording of the moment; each that needed a second try on a line that begins
  `second try`, with the picture of its first failure; and what went wrong outside the
  checks on a line that begins `not proven`. It closes with a count, is never greener than
  Playwright's runner, as the database command is not, and closes its app whatever
  happened. Pictures, recordings and the runner's report land under `browser/results/`,
  which is never committed; a picture and a recording are kept for a check that failed and
  for nothing else, and no trace is ever kept, since a trace holds every request and the
  reset link's token with it (§17). Every account and row they show is made up. A check
  that fails is tried once more only when the command is told `--second-try`. Two checks
  are kept for proving that a failure is reported — one false on purpose
  (`browser/false-on-purpose.browser.ts`) and one that fails at its first try and passes at
  its second (`browser/second-try-on-purpose.browser.ts`) — and join a run only when asked
  for, by `BROWSER_FALSE_CHECK=1` and `BROWSER_SECOND_TRY_CHECK=1`. The browser checks do
  not compare the screen with reference pictures, and prove nothing of speed or
  accessibility, nor of the behaviors no journey walks through.

### The checks on GitHub

- The checks run in GitHub Actions (`.github/workflows/ci.yml`), once per push, as two jobs
  side by side, with the desktop job beside them, and on a pull request a third, small one
  that decides whether the second runs. The desktop job runs `npm ci`,
  `npm run typecheck:desktop` and `xvfb-run -a npm run test:desktop`, and keeps what
  `desktop/results/` then holds as a file on the run's page; it runs in full on every run.
  The first and second jobs never start the desktop app and are told to leave Electron's
  program undownloaded (`ELECTRON_SKIP_BINARY_DOWNLOAD`). A pull request runs them in full when it is opened or reopened and on every
  push to its branch, but for the database checks when a pull request into `main` brings
  only documents and after a push that changed only documents (both below), on the branch
  merged into `main` as `main` stands; while the two conflict, GitHub starts no run. A push
  to `main` runs them again, without the checks that start the test runner from a
  subfolder: they guard the test tools and not the app, and the
  pull request ran them in full. A push to a branch with no pull request runs none. The
  first job runs, in this order: `npm ci`,
  `npm run docs:check`, `npm test`, `npm run build` (with the three public `VITE_` values a
  repository sets as variables, handed to that step alone, so no test sees them; a
  repository that sets none builds with them empty),
  a check that the
  built app holds nothing of the practice copy, `npm audit --omit=dev --audit-level=high`,
  a census regeneration
  (`node scripts/design-census.mjs --write` followed by `git diff --exit-code DESIGN-SYSTEM.md`)
  that fails when the `<!-- census: … -->` tables are stale, and the type check once more
  with the folders that `.vercelignore` names left out, since the hosting build works from
  an upload without them; a test in the suite names any file under `src/` that imports
  from such a folder. The second installs the Supabase
  tool at a fixed version and Chromium at the version the driver needs (its download kept
  between runs; first, since some database checks start the browser command), brings the
  practice copy up from nothing, runs the database checks and the rolled-back checks, and
  runs the browser checks
  (`npm run test:browser -- --second-try`), keeps whatever `browser/results/` then holds as
  a file on the run's page whenever the browser checks ran, whether they passed or not (a
  run that stops at an earlier step keeps none), and always throws the copy away;
  a practice copy that cannot start fails its own step, so it reads differently from a
  check that failed. There, and only there, a database check or a browser check that fails
  is tried once more: the run is green when the second try passes, and lists every check
  that needed one — a browser check with the picture of its first failure — so an unsteady
  check stays visible. On `main` the database command is also told to leave the checks that start the
  test runner from a subfolder out (`npm run test:db -- --second-try
  --leave-out-subfolder-checks`), and names each as switched off; told nothing, as on the
  developer's machine, it leaves nothing out. On a pull request the second job waits for
  the third (`scripts/ci/documents-only.mjs`), which decides by one of two rules. A pull
  request into `main` whose files differ from `main`'s only in markdown — every file that
  differs between the merge the run tests and its first parent, `main`'s commit, is an
  `.md` file, a renamed file counting as one removed and one added — is decided on every
  run, its opening included, by `main`'s own run of the checks on that commit, the newest
  on it, as its database job ended in its latest attempt: passed, and the second job is
  skipped; failed or ended any other way, and the database checks run in full; not ended
  yet, or no run of it found, as just after a merge, and the third job waits until it
  ends, reading it again every 30 seconds for at most 15 minutes, then skips the second job
  if that check passed and runs the database checks in full if it failed or is still going
  or missing. The skip relies on `main`'s run, which leaves out the checks that start the
  test runner from a subfolder. The run then shows the second job as skipped, never as
  passed, with a notice naming `main`'s commit and that run and, when it waited, for how
  long; a full run's notice says which of these it met. Every other pull request — one into
  another branch, or one into `main` that brings anything besides markdown, whose notice
  then opens by naming up to three of the files it brings that are not markdown — has the
  second job skipped only after a push to the branch, when an earlier run of the same pull
  request, one that started before this one, passed the database checks; that run's log
  records what it tested — the state of the branch it merges into, and a fingerprint of
  every file of the merge — as every run of the third job
  records its own; that merge, rebuilt from the pull request's newest commit then and the
  recorded state, comes out cleanly with the recorded fingerprint; and nothing but markdown
  files — any `.md` file, wherever it sits — differs between its files and the files this
  run tests. The run then shows the
  second job as skipped, never as passed, with a notice naming that commit and that run.
  For such a pull request, opening or reopening it, an earlier run that was stopped, failed
  or itself skipped or that holds no record, an earlier merge that does not come out as
  recorded, or a code file anywhere in the difference (a code file renamed to `.md` counts
  as the code file it was): the database checks run in full. Under either rule, anything the
  third job cannot read runs them in full too, a read of GitHub or git that takes longer
  than 90 seconds among them; while the third job waits for `main`'s check, a read of it that
  fails is first tried again 30 seconds later, at most twice more. The first job runs in full on every push, and there is no way to
  force a full database run on a pull request that brings only documents or on a push that
  changed only documents. The third job reads the run history and its logs
  with the run's own automatic token and writes nothing; on `main` it does not run, and the
  second job runs as before. A newer push to a pull request's branch stops
  its older run that is still going; on `main` each push's run runs to its end, and none
  waits behind another. No job needs a secret, and each runs on the Node major Vercel
  builds with. A run is made once per push, on the push's newest commit, so a red check is
  visible on the pull request and on its newest commit, and on the newest commit of each
  push to `main`: a merge that brings several commits marks the last alone, and a commit
  pushed before its branch has a pull request carries no mark. The repository's GitHub plan
  cannot block a merge, so the rule that `main` is never pushed red lives in `AGENTS.md`.
- A second workflow, `.github/workflows/desktop-download.yml`, makes the desktop app's
  download on a Mac and checks it: the signature, the two kinds of Mac, and the desktop
  check run on the packaged app. It runs on a pull request that changes how the app is
  packaged, and when started by hand, and only then, on `main`, can draft a release (§22).
  The drafting job is the one job that may write to the repository: it has the run's own
  GitHub token with leave to write contents, and no stored secret.

### Where a new test goes

- A new test joins the file of the behavior it checks, or becomes that behavior's file. A
  check that only a running Compass can show is performed by the agent that builds the
  change, in the practice app, and its picture of the screen or what the command printed goes
  in the pull request; the verification skill (below) is how an agent drives it.
- `npm run lint` runs ESLint (`eslint.config.js`) over `src/`, `scripts/`, `browser/`,
  `desktop/` and the config files, and fails on any finding, a warning included. It reads each file on its
  own, without the types, so it catches what the type check lets through: TypeScript's and
  JavaScript's recommended rules, the two classic React hooks rules (hooks called in the
  same order every render, effects that name what they read), and Vite's fast-refresh rule
  in `src/`. The hooks plugin's React Compiler rules are off, since Compass does not use the
  compiler. A rule switched off for a single line gives its reason on that line, and a
  switch-off that no longer silences anything fails the run.

### The verification skill

- `.claude/skills/verify-compass/` is a skill for agents (Claude Code finds it there; `AGENTS.md`
  names it for the others) that drives the practice app the way a person does and keeps
  evidence of every step. Its commands run from a plain terminal
  (`node scripts/verify/verify.mjs …`) and drive a real Chromium through Playwright's library,
  not its test runner; it belongs to none of the three groups above and does not run on GitHub.
- It walks eleven journeys, one per user-facing section from §5 to §15, each a file of steps
  under `scripts/verify/journeys/` named in the skill's feature map (`features/`, one file per
  section); `node scripts/verify/verify.mjs map` fails when the map and the journeys name
  different steps. A step proves what a person sees and, where it saves, the rows read back as
  the signed-in account. Faults go in at the browser's own edge — a request refused, held, or
  answered with its reply lost — and other days through the browser's clock.
- A run starts the practice app at the practice app's address from the checkout it is started
  in, after bringing the practice copy up when it is down, and refuses when that address is
  taken (I18). Each journey signs up an account of its own, made up and on the practice copy
  only (`verify-…@compass.test`). Every request a journey's page makes to an address other than
  the practice app and the practice copy is refused and fails the step, and so does an error
  or a warning the page prints that the step does not name. Cleanup stops only the processes
  the run started, removes the run's accounts with every row they own, and throws the practice
  copy away only when the run brought it up.
- The evidence lands in `verify-results/<run>/`, which is never committed: after every step a
  picture and the page's accessibility outline, the rows read back, the errors and warnings
  the page printed, every answer of 400 or more with its status and error code but no body, a
  recording of a journey that failed, and a report of every step. No reset link or session
  token is written there; the run's made-up passwords are, and stay there.
- It shares the practice app's address with `npm run test:browser` and `npm run practice:app`,
  and the practice copy with the database checks and the rolled-back checks, so it runs alone:
  a journey's writes during the rolled-back checks would read as rows left behind.
