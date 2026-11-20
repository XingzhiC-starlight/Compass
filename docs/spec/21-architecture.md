## §21 Architecture

Code: `src/main.tsx`, `src/App.tsx`, `src/lib/projectRouting.ts`, `src/lib/db.ts`, `src/lib/supabase.ts`, `src/lib/localClient.ts`, `src/lib/localDatabase.ts`, `src/lib/transforms.ts`, `src/lib/types.ts`, `src/dashboard/Dashboard.tsx`, `src/dashboard/dashboardLoad.ts`, `src/dashboard/useServerState.ts` · Keeps: I1, I3, I4, I9, I11, I12, I17, I19, I20, I21

The shape of the code: the layers, who owns which state, every operation of the seam, and
the flows that run through them. The behavior a person sees is in §5 to §15. A rebuild keeps
what this section states as it keeps §4. The table of the seam's operations is checked
against `src/lib/db.ts` by `npm run docs:check`: an operation exported but not listed, or
listed but no longer exported, fails the check.

### Layers

Four layers, and nothing reaches across one.

1. **The screens.** React components under `src/`: the landing page (§15), the login and
   recovery screens (§5), the setup (§13), the archive screen (§6), and the dashboard with its
   sidebar and cards (§6 to §12). A screen holds the state of what it shows and calls the seam
   for everything stored. No screen imports the Supabase client, holds a row cache, or uses a
   router (I9) or a React context.
2. **The seam**, `src/lib/db.ts`. The only module in the app that imports
   `src/lib/supabase.ts` (I1). Every read, every write and every auth call is one of its
   exported operations, listed below. It maps rows to the types of `src/lib/types.ts` through
   `src/lib/transforms.ts` on the way in and out.
3. **The client**, `src/lib/supabase.ts`. `getSupabase()` creates the client on its first
   call, never at import (I12), and keeps it. Which client is decided there, once, from
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (I19), unless the page is inside the
   desktop app: when `window.compassDesktop` is there, it is the local client over the
   desktop's backend, `createLocalClient(desktopBackend(window.compassDesktop))`, whatever the
   two values are (§22). Otherwise: with both, it is the Supabase
   client, made with the project address and the public key and no other option, so the
   session persists in `localStorage` and a sign-in link's token in the address is read by
   the client itself. With neither, it is the local client,
   `createLocalClient(browserBackend(() => window.localStorage))` from
   `src/lib/localClient.ts`, handed back under the Supabase client's type. With one alone,
   the call throws an error whose message names both values, keeps no client, and throws
   again at every later call. A value is given when it is not empty: an empty text is the
   same as a value never set, so a build with both left blank, as the suite's is (§19),
   gets the local client. The late creation is load-bearing: the gate reads the address for a
   recovery token and a failed-redirect error before the first call creates the client, and
   the Supabase client reads the address for a session when it is created, so the order of
   the two is kept.
4. **The database**, one of two (I19). With a Supabase project: Postgres with owner-only
   row-level security (I2), the schema of `supabase/migrations/` (§3, §18) and one function,
   `save_interview` (§13); the browser sends no SQL. With none: the local database on this
   device, described next.

**The local client and the local database.** The local client stands where the Supabase
client stands and answers what the seam calls on it, and nothing more: `from(table)` with
`select`, `insert`, `update` and `delete`; the filters `eq`, `neq`, `is`, `not`, `lt`, `lte`,
`gt`, `gte` and `in`; `order`, `limit`, `single` and `maybeSingle`; `rpc("save_interview",
…)`; and `auth`. A request is built by chaining and sent when it is awaited, and its answer
is the Supabase client's shape: `{data, error, count, status, statusText}`, of which the
seam reads `data` and `error`; `count` is always null, and the error is `{code, message,
details, hint}`. Beside the Postgres codes of §3, it refuses as the Supabase client's server
does: a table it does not have with `PGRST205`; a column it does not have, in a filter, an
order or a row, with `PGRST204`; a function other than `save_interview`, or one whose
parameter names are not exactly its ten, with `PGRST202`; and one row asked for (`single`,
or `maybeSingle` with more than one) when the count is wrong with `PGRST116`, the write, if
it was one, kept all the same. The setup's lists handed as anything but a list are refused
with `22023`.
It carries the mark `storesOnThisDevice: true`, which the seam's `storesOnThisDevice()`
reads. Its `auth` has no accounts: `getSession` always answers the one local person, a fixed
id with an empty email; `onAuthStateChange` hands back a subscription and never calls;
`signOut` does nothing and answers no error; every other call answers the error "this copy
of Compass has no accounts".

The client does not hold the tables. It hands each request, as plain data, to a backend, one
method: `send(request)`, answering a promise of the answer. A request is one of two: a
query, `{kind, table, payload, filters, ordering, limit, shape, columns}`, where `kind` is
`select`, `insert`, `update` or `delete`, `payload` a row or a list of rows or null, a
filter `{column, op, value}` with `not` written as the op `not.<op>`, an ordering `{column,
ascending}`, `shape` one of `rows`, `single` and `maybeSingle`, and `columns` the columns to
answer with, null when a write asked for no rows back; or a call, `{kind: "rpc", fn, args}`.
The surroundings are `{now, newId}`: a function answering the instant as an ISO text, and
one answering a new id, for which the browser's backend gives `randomId` of
`src/lib/transforms.ts`. `browserBackend` is the backend
in a browser: per request it reads the kept text, runs the request, and writes the text back
when a row changed (§3). Running a request is the pure engine's work,
`runLocalRequest(tables, request, surroundings)` in `src/lib/localDatabase.ts`: it takes the
tables, the request, and a clock and an id maker, never changes the tables it was handed,
and answers the result with the tables to keep, the same object when nothing changed. So
another holder of the data is another backend over the same engine, and neither the client
nor the seam changes. There are two more. `desktopBackend(bridge)` is the page's backend
inside the desktop app: it hands each request to `bridge.send` and answers what comes back,
and a request whose `bridge.send` fails is answered with `COMPASS_LOCAL_UNREACHABLE`, with no
time limit on one still waiting (§22). Behind that bridge,
in the desktop app's main process, the file's holder (`fileBackend` in `desktop/dataFile.ts`)
runs the request and keeps the tables in a file (§22).

Pure logic touches neither React nor the database and takes its inputs, the clock included,
as arguments; only `todayDate`, `dayNumber`, and the two that call `dayNumber`,
`commitmentEyebrow` and `timelineGlance`, read the clock themselves.

| Pure module | Computes |
|---|---|
| `src/lib/transforms.ts` | The row mappers. The feed math, `computeGroup`, `computeUngroup`, `computeMerge` and `computePop` (§12). The time math: `localYMD`, a date's local day key; `todayDate`; `localDayEnd`, the local midnight that ends a day key; `closeSessionAt`, a session's end and its seconds when closed now, capped at its own day's end; `loggedSecondsOn`, a day's seconds from its sessions, a running one counted live; `bucketDailyTime`, one entry per day for the last N days; `deriveDashboardTime`, today's seconds, whether a session is open, and the series, from one reading of the clock. `randomId`, a v4 UUID made without `crypto.randomUUID`, which older iOS lacks. |
| `src/lib/projectRouting.ts` | `chooseActiveProject`: the current id when it is still live, else the first live project. The reload reducer, `dashboardReloadReducer`: one counter, the quiet-refresh request, which the gate bumps on a failed save and passes to the dashboard. |
| `src/lib/recoveryLink.ts` | The reset link's one-time token: find it in the query or the hash, take it, and replace the address without it (§5). It reads the page's address itself and rewrites it: the one module here that is not given its inputs. |
| `src/lib/limits.ts` | `TEXT_LIMITS`: `projectName`, `phaseName`, `learningItemName`, `thoughtGroupName` and `thoughtTitle` at 200, `taskText` and `thoughtText` at 4,000, one per text column a person types into (§3); the accent color's length check has none, since the seam picks the color. |
| `src/dashboard/dashboardLoad.ts` | `shouldAcceptProjectPayload`, true for the latest request and the active project, and `projectCardTreeKey`, the id and the version joined (I11). |
| `src/dashboard/projectTime.ts` | `dayNumber`: the whole days from a day key to today on the local calendar, the key's day being day 1; the cards, and the shared lines below, clamp it. `fmtH`: seconds as hours to one decimal, a whole number without it. What the cards and the companion (§23) both show, each worked out once: `phasePacing`, the current phase's start, the remaining days and whether every phase is done (§7); `commitmentEyebrow`, the Commitment card's line (§8); `timelineGlance`, the current phase, its name, its progress and the Timeline's line (§9); `learningGlance`, the focus item, its percent and the Learning card's line (§10). |
| `src/companion/companionSummary.ts` | The companion's own lines (§23): `clockSeconds`, the seconds to show from a reading and the moment it was taken; `formatClock`, the clock's face; `goalPct`, the share of the daily goal; `taskGlance`, the task heading and the open tasks; `listedTaskIds`, which tasks are listed when a reading arrives, four at most (`COMPANION_TASKS`). |
| `src/dashboard/hoursEdit.ts` | `parseHoursEdit`: the number typed into an hours field, or nothing when the text is unchanged, empty or not a plain decimal (§8). |
| `src/dashboard/learningFocus.ts` | The focus rules for a drag, an added item and a deletion (§10). |
| `src/dashboard/keys.ts` | `isSubmitEnter` (I13). |
| `src/auth/passwordRules.ts`, `src/auth/authErrors.ts`, `src/auth/authRedirectNotice.ts`, `src/auth/captchaSize.ts` | The password policy (§5); the calm copy for a reset error (§5); the notice for a failed auth redirect (§2); the CAPTCHA box for a viewport width (§5). |
| `src/landing/landingDemo.ts` | The demo's frames and hotspot rectangles (§15). |

The seam's own tests replace `src/lib/supabase.ts` with `src/lib/fakeSupabase.ts`, or hand it
a local client over a pretend storage, so a rebuild keeps `getSupabase()` as the one import
point, called at each use; the screens' tests replace the seam itself, whole or in part
(§19).

### Module map

| Module | Owns |
|---|---|
| `src/main.tsx` | Mounts `App` under React's strict mode. |
| `src/App.tsx` | The gate: which screen shows (§2). The sidebar's data. A copy of the active project id. The failed-save note, the quiet refresh and its retries. The recovery route and the pending reset token. The notice from a failed auth redirect. |
| `src/auth/` | The login screen with its three modes, the recovery screen, the CAPTCHA widget, the password checklist (§5). |
| `src/interview/Interview.tsx` | The setup form and its one identity per visit (§13). |
| `src/archive/ArchiveScreen.tsx` | The standalone archive list; it reads its own list (§6). |
| `src/dashboard/Dashboard.tsx` | The active project's payload, its loading and failure states, the summary ⇄ depth view, the keyed card tree, the values derived for the cards (§7), and the companion's window (§23). |
| `src/companion/Companion.tsx` | The companion (§23), drawn through a portal into the window `Dashboard` hands it: its own reading of the active project, its clock, which tasks it lists, the thought being typed, and the writes it sends. |
| `src/companion/companionWindow.ts` | Opening the companion's window and making its empty document ready; bringing the main window forward; hearing the desktop app ask for a thought. Beside `src/lib/supabase.ts`, the one module that looks at `window.compassDesktop`: whether it is there, its `show` and its `onCapture` (§22). |
| `src/dashboard/useServerState.ts` | A card's copy of a server value, re-adopted in place when the sync version changes. |
| `src/dashboard/Sidebar.tsx`, `TimeCard.tsx`, `TimelineCard.tsx`, `LearningCard.tsx`, `TaskPanel.tsx`, `ThoughtLog.tsx` | Each card's list, its open editors and drafts, its drag state, its selection, and the writes it sends (§6, §8 to §12). |
| `src/dashboard/useAddBox.ts` | An add box that waits for its save, with no time-out (§7). |
| `src/dashboard/useDragReorder.ts`, `useEdgeAutoScroll.ts`, `useDeleteConfirm.tsx` | Drag-reorder by grip, the edge scroll while dragging (§12), and the delete confirmation (§6). |
| `src/lib/db.ts` | The seam: the operations below, the active project id, the cached user, the count of saves in flight, the write-error listeners, the listeners for saves settled, and two queues. |
| `src/lib/supabase.ts` | The lazily created client (I12), and the choice between the two (I19). |
| `src/lib/localClient.ts` | The local client, its `auth` with no accounts, the backend's one method, the browser's backend with the key the text is kept under, and the page's backend inside the desktop app. |
| `src/lib/localDatabase.ts` | The pure engine: the seven tables' columns and rules, a request run over tables, the setup's save, and the kept text's format (§3). |
| `src/lib/types.ts` | The domain types, one per table, plus `User` and `InterviewInput` (§3). |
| `supabase/migrations/` | The schema of record and the one database function (§18). |
| `desktop/` | The desktop app around the page: the main process, the bridge, the data file's holder, the menu bar, the note at the goal, the preferences file, and its build (§22). Not part of the page, and imported by nothing under `src/`. |

### State ownership

| State | Owner | Lives in | Changed by |
|---|---|---|---|
| Who is signed in | the Supabase client | its session in `localStorage` (I7) | sign-in, sign-out, token refresh, inside the client. On this device (I19): always the one local person, held nowhere and changed by nothing |
| The rows, on this device (I19) | the browser's backend | one text under `localStorage["compass.localDatabase"]` (§3); no copy is held in memory between requests | each request that changes a row |
| The rows, in the desktop app (§22) | the main process's file holder | the file `compass-data.json`, and the tables held in the main process since the first request | each request that changes a row |
| The cached user, `{id, email, name?}` | the seam | a module variable | every auth event, `getCurrentUser`, `signOut`; read to notice a change of user and to stamp a new thought group's owner on the client side only |
| Which screen shows | `App` | `screen` state; "loading" is only its first value | the gate (§2) and the screens' callbacks |
| The active project id | the seam | a module variable, read once at load from `localStorage["compass.activeProjectId"]` and written back on every change; `App` keeps a copy for rendering | `setActiveProject`, `saveInterview` (the new project), `deleteProject` (the first remaining live project, or none) |
| The sidebar's data: live projects, archived projects, which are finished | `App` | `shell` state | loaded by the gate; survives a project switch; replaced whole by a quiet refresh; edited in place on a rename, a reorder and a change of completion |
| The project payload | `Dashboard` | `data` state, null while loading or failed | one load per active project id; replaced in place by a quiet refresh; patched in place on a pill rename and on a change to the phases, so the values derived for the cards and the sidebar's finished mark follow at once (§6, §7) |
| The card tree's version | `Dashboard` | `projectDataVersion`, part of the tree's key | each accepted load, which remounts the cards (I11) |
| The sync version | `Dashboard` | `syncVersion` | each accepted quiet refresh; the cards adopt the new payload in place |
| The companion's window (§23) | `Dashboard` | `companionWin` state, the window or null | the sidebar's Companion button opens it or brings it forward, and so does the desktop app asking for a thought (§22); the window closing clears it; the dashboard unmounting or the page going closes it; it survives a project switch and a load |
| How many times a thought was asked for from outside (§22, §23) | `Dashboard` | `captureRequest` state, 0 for none | the desktop app's asking, heard through the bridge, adds one once the companion is open; the companion closing sets it to 0 |
| The companion's reading: the payload, the clock as `{baseSeconds, baseAtMs, running, date}`, the listed task ids | `Companion` | plain state, beside the dashboard's payload and never copied from it | a read of `getProjectDashboardData` when it mounts, on a project switch, whenever saves have settled, when its summary opens and on a new day; its own presses first, then the seam (§23) |
| Summary ⇄ depth | `Dashboard` | `view` state, not persisted | a click on a card's negative space; it survives a project switch and resets when the dashboard unmounts |
| A card's list: phases, learning items, tasks, thoughts and groups, the day series, today's seconds, the running flag, the daily goal | the card | `useServerState` copies of the payload | the card's own edits first, then the seam; re-adopted when the sync version changes |
| Open editors, drafts, a selection of thoughts, drag state, a learning item's remembered previous percent, today's day key | the card | plain state | the person's actions; lost when the card tree remounts, kept across a quiet refresh. The running clock's on-screen seconds are the card's copy of today's seconds above, ticked once a second and replaced by a quiet refresh |
| The login form's starting mode, sign in or forgot | `App` | plain state; the login screen is keyed by it, so a change remounts the form | the landing's "Log in" sets sign in; "Send a new reset link" sets forgot (§5); the gate never sets it |
| Whether a live project exists; the archived count | `App` | plain state | the gate, and the quiet refresh of the sidebar's part |
| Task list ⇄ Thought log | `TaskPanel` | `panelView`; both panes stay mounted | the header's two buttons (§11) |
| Days ⇄ Weeks | the Commitment card | plain state, not persisted | the card's header button (§8) |
| Projects ⇄ Archive, the rename draft, the Settings panel | `Sidebar` | plain state | the header button, the active pill, the gear (§6, §14) |
| Saves in flight and their settle waiters; the write-error listeners; the two queues | the seam | module variables | every tracked write; `onWriteError`; `setFocusItem`, `removeLearningItem`, `setLoggedSecondsForDate` |
| The failed-save note; which refresh parts are still owed | `App` | `saveFailed` state; `owedParts` | the write-error listener; each refresh's result (§2) |
| The recovery route and the pending reset token | `App` | refs, so strict mode's second mount sees them | the page load; saving the new password; asking for a new link |

Nothing else is kept in the browser: no theme, no view, no draft, no selection.

### The seam's operations

Every write to the database is wrapped in `tracked`, which counts it from the call until its
answer, failed or not; reads and auth calls are not counted, and neither is
`setActiveProject`, which touches only the seam's variable and its `localStorage` copy. A write that needs the project reads the
seam's active project id when it is called, except `setLoggedSecondsForDate`, which reads it
when its queued job runs. A failed write is reported once: one console line holding the
error's code and the first line of its message, and the same pair to every `onWriteError`
listener; the row, the typed text and the database's detail text are never logged (§17). Then
the operation answers in one of four shapes, and the callers depend on which: the five
writes that create a row and wait for it (`saveInterview`, `addPhase`, `addLearningItem`,
`addTask`, `addThought`) reject with `SaveFailedError`; `startSession` resolves null and
`updateTask` and `updateThought` resolve false; the four feed reshapes (`groupThoughts`,
`ungroupThoughts`, `mergeThoughtsIntoGroup`, `popThoughtsFromGroup`) resolve null when their
fresh read of the feed failed and the computed feed otherwise, a failed write included;
every other write resolves with nothing, so a caller that awaits it cannot tell that it
failed, and the quiet refresh (§2) is what repairs the screen. Reads throw the error they
got, unreported. The gate and the dashboard's load turn a failed read into their calm line
with "Try again" (§2, §7); a quiet refresh leaves the screen as it is and is owed; the
archive screen's list read and the Commitment card's two re-reads, after a stop and at the
day roll, have no failure path, so a failed one leaves the screen as it is, the archive
screen on "Loading…" until "← Back". Auth calls throw too, except `getCurrentUser`, which
answers no user on an auth error, and `signOut`, which never throws. An update or a delete
that matches no row is not an error.

Two queues serialize writes that are several statements with no transaction: the focus
queue (`setFocusItem`: clear every focus flag, then set one; `removeLearningItem`: delete
the row, then set the next focus when one is given) and the
time-edit queue (`setLoggedSecondsForDate`: insert the new total, then delete the day's other
sessions). Each is a chain of promises; a job runs after the previous one settled, pass or
fail. Every other write may interleave.

Scope: *user* is every row of the signed-in person; *active* is the active project, from the
seam's variable; *id* is the row named by the call. Failure: *throws* is the raw error;
*reports* is the one report above, then the answer named. An order number is an integer
counted from 0.

<!-- census: seam -->
| operation | group | takes | does | scope | on failure |
|---|---|---|---|---|---|
| `storesOnThisDevice` | auth | nothing | answers at once, with no promise, whether the client is the local one (I19), by its mark; creates the client when it is the first call | none | throws when the client is half configured |
| `getCurrentUser` | auth | nothing | reads the stored session and caches its user; on this device, always the one local person | user | fails when the client is half configured; an auth error reads as no session |
| `signInWithGoogle` | auth | nothing | starts the Google redirect with the page's origin as the return address (I5) | none | throws |
| `signUpWithEmail` | auth | email, password, a CAPTCHA token when there is one | signs up, with the origin as the confirmation's return address; answers whether confirmation is needed | none | throws |
| `resendEmailConfirmation` | auth | email, a token when there is one | resends the confirmation, same return address | none | throws |
| `signInWithEmail` | auth | email, password, a token when there is one | signs in with a password; no return address | none | throws |
| `sendPasswordReset` | auth | email, a token when there is one | sends the reset email with the origin as the return address | none | throws |
| `updatePassword` | auth | the new password | sets the signed-in user's password; the user id stays, so the gate does not re-run | none | throws |
| `verifyRecoveryToken` | auth | the token hash | spends a reset link's one-time token; on success the client stores the recovery session and fires the recovery event | none | throws |
| `signOut` | auth | nothing | signs out of every session of the user and forgets the cached user; the local session goes even when the server call fails | user | never throws |
| `onAuthChange` | auth | a callback | subscribes to the client's auth events; updates the cached user on each; calls back only when the user id changed, and never on the recovery event; answers the unsubscribe | none | throws when the client is half configured |
| `onPasswordRecovery` | auth | a callback | a second subscription that calls back only on the recovery event | none | throws when the client is half configured |
| `isPasswordRecoveryUrl` | links | an address, the page's when omitted | whether the query or the hash carries `type=recovery` or `redirect_type=recovery` | none | false on a malformed address |
| `getAuthRedirectError` | links | an address, the page's when omitted | the error a failed auth redirect put in the query, else in the hash, in the parameters `error`, `error_code` and `error_description`: `{code, description}`, the code from `error_code`, else `error`, else `auth_error`; the description from `error_description`, else `error`, else "Authentication did not finish." | none | null when there is none or the address is malformed |
| `cleanAuthRedirectErrorUrl` | links | an address | the address without `error`, `error_code` and `error_description`, in the query and in the hash, an emptied hash dropped | none | a malformed address is answered unchanged |
| `consumeAuthRedirectError` | links | nothing | takes that error from the page's address and replaces the address without it | none | null when there is none |
| `SaveFailedError` | saves | the failure | the error the five create-and-wait writes reject with: the code and the one-line summary | none | none |
| `onWriteError` | saves | a listener | subscribes it to every reported failure; `App` subscribes, and the companion while it is open (§23); answers the unsubscribe | none | none |
| `savesInFlight` | saves | nothing | how many tracked writes have not answered | none | none |
| `whenSavesSettle` | saves | nothing | resolves when that count next reaches zero, at once when it already is | none | none |
| `onSavesSettled` | saves | a listener | calls it, with nothing, every time that count reaches zero, the last save kept or refused, after the waiters of `whenSavesSettle` have been resolved; never for a read; the companion is the one subscriber (§23); answers the unsubscribe | none | none |
| `listProjects` | shell | nothing | the live projects by `sort_order` | user | throws |
| `listArchivedProjects` | shell | nothing | the archived projects, newest first | user | throws |
| `listProjectCompletion` | shell | nothing | every project id, archived ones included, and every phase; answers a map from project id to whether it is finished, which is having phases and all of them done (§6) | user | throws |
| `getDashboardShellData` | shell | nothing | the three reads above in parallel: `{projects, archived, completion}` | user | throws |
| `getProjectDashboardData` | payload | a project id | in parallel: the project row; its phases, learning items and tasks by `sort_order`, tasks never filtered by date (I10); the time of the last 49 days; the thoughts and the groups, as two lists, each by `sort_order`. Answers `{project, phases, learning, tasks, loggedSeconds, running, daily, thoughts, thoughtGroups}`: `loggedSeconds` is today's total, `running` whether a session of the project is open, `daily` 49 entries of `{date, loggedSeconds}`, `date` a local day key (`yyyy-mm-dd`, I4), oldest first, today last, a day with no sessions holding 0. Null when the project row is missing | the given id; the stale-session close inside is user-wide | throws |
| `archiveProject` | projects | a project id | sets `archived_at` to now | id | reports |
| `unarchiveProject` | projects | a project id | clears `archived_at` and sets `sort_order` to one past the highest live project's | id; the count is user-wide | reports |
| `reorderProjects` | projects | the live project ids in order | one update per id: `sort_order` = its place in the list | ids | reports the first failure; rows that saved stay saved |
| `setActiveProject` | projects | a project id | sets the seam's active project id and its `localStorage` copy; no network | none | none |
| `getActiveProjectId` | projects | nothing | the seam's active project id, or null | none | none |
| `deleteProject` | projects | a project id | deletes the project row; the database cascades (§3); when it was the active one, the first remaining live project becomes active, or none | id | reports |
| `renameProject` | projects | the name | sets `name`, "My project" when empty | active | reports |
| `setHoursPlannedPerDay` | projects | hours | sets `hours_planned_per_day`, floored at 0 | active | reports |
| `saveInterview` | projects | the setup's answers, an `InterviewInput` | reads the live projects for the accent and the place, then one `save_interview` call (§13); makes the new project active; answers it | user, then the new project | reports, rejects with `SaveFailedError` |
| `setPhaseDone` | phases | a phase id, done or not | sets `is_done`, and `completed_at` to today's local day or null (I4) | id | reports |
| `addPhase` | phases | a name, the days (1 when omitted, as the card omits it) | reads the project's phases' order numbers and inserts one past the highest, 0 for the first, with the trimmed name, "New phase" when empty; answers the row | active | reports, rejects with `SaveFailedError` |
| `renamePhase` | phases | a phase id, the name | sets `name`; an empty name sends nothing | id | reports |
| `setPhaseDays` | phases | a phase id, the days | sets `est_days`, rounded and floored at 0 | id | reports |
| `removePhase` | phases | a phase id | deletes the row | id | reports |
| `reorderPhases` | phases | the phase ids in order | one update per id: `sort_order` = its place | ids | reports the first failure |
| `setLearningProgress` | learning | an item id, the percent | sets `progress_pct`, rounded and clamped to 0 to 100 | id | reports |
| `setFocusItem` | learning | an item id | queued: clears `is_focus` on the project's items, then sets it on one | active | reports; the second write is skipped when the first fails |
| `renameLearningItem` | learning | an item id, the name | sets `name`; empty sends nothing | id | reports |
| `addLearningItem` | learning | a name | reads the project's items' order numbers and inserts one past the highest, 0 for the first, at 0 % with no focus; answers the row | active | reports, rejects with `SaveFailedError` |
| `removeLearningItem` | learning | an item id, the next focus id or null | queued: deletes the row, then moves the focus to the id given, when one is | active | reports |
| `reorderLearningItems` | learning | the item ids in order | one update per id | ids | reports the first failure |
| `addTask` | tasks | the text | reads the project's tasks' order numbers and inserts one past the highest, 0 for the first, with `task_date` = today (I10) and empty links (I16); answers the row | active | reports, rejects with `SaveFailedError` |
| `updateTask` | tasks | a task id, `text` or `isDone` or both | sets `text` or `is_done`; answers whether it saved | id | reports, resolves false |
| `removeTask` | tasks | a task id | deletes the row | id | reports |
| `reorderTasks` | tasks | the task ids in order | one update per id | ids | reports the first failure |
| `todayDate` | time | nothing | today's local day key, `yyyy-mm-dd` (I4); re-exported from `src/lib/transforms.ts` | none | none |
| `getTodayLoggedSeconds` | time | nothing | closes stale sessions, then sums today's sessions of the project, a running one counted live | active; the close is user-wide | throws |
| `listDailyTime` | time | a number of days | closes stale sessions, then one entry per day for the last N days, zeros included, today last | active; the close is user-wide | throws |
| `startSession` | time | nothing | closes stale sessions and every running session of the user, each at the earlier of now and its own day's end; then inserts a running session for the project, dated today; answers it | user, then active | reports, resolves null; nothing is inserted when a close fails |
| `stopSession` | time | nothing | closes the project's running sessions by the same rule; does not close stale sessions | active | reports |
| `setLoggedSecondsForDate` | time | a day key, the seconds | queued: inserts one ended session holding the day's new total, then deletes the day's other sessions of the project, a running one included | active, read when the job runs | reports; a failed delete leaves the day doubled until its next edit |
| `addThought` | thoughts | the text | numbers the thought by the count of loose thoughts plus groups, inserts it loose with the trimmed text and an empty title; answers the row | active | reports, rejects with `SaveFailedError` |
| `updateThought` | thoughts | a thought id, `text` or `title` or both | sets `text` or `title`; answers whether it saved | id | reports, resolves false |
| `removeThought` | thoughts | a thought id | deletes the row; nothing is renumbered | id | reports |
| `reorderFeed` | thoughts | the feed items in order, each an id with its kind, thought or group | one update per item: `sort_order` = its place | ids | reports the first failure |
| `reorderThoughtsInGroup` | thoughts | a group id, the member ids in order | one update per member, guarded by the group id | ids | reports the first failure |
| `groupThoughts` | thoughts | the thought ids, a name | reads the feed fresh, runs `computeGroup` with a group id from the browser's `crypto.randomUUID` (its fallback where that is missing is not a UUID, `docs/ideas.md`), writes the difference; answers the new group and the feed | active | reports; null when the read failed, else the computed feed even when a write failed |
| `ungroupThoughts` | thoughts | a group id | the same with `computeUngroup` | active | the same |
| `renameThoughtGroup` | thoughts | a group id, the name | sets `name`; empty sends nothing | id | reports |
| `moveThoughtToGroup` | thoughts | a thought id, a group id (or null, which no screen sends) | sets `group_id` and `sort_order` = the group's member count; with null, makes the thought loose at the end of the feed, numbered by the count of loose thoughts plus groups; a failed count reads as 0 | id; the count by group id alone (I3), or by the active project for null | reports the update's failure only |
| `mergeThoughtsIntoGroup` | thoughts | a group id, the thought ids | the same with `computeMerge` | active | the same as `groupThoughts` |
| `popThoughtsFromGroup` | thoughts | the thought ids | the same with `computePop` | active | the same as `groupThoughts` |
| `__setTestUser` | test | a user or null | sets the cached user without Supabase; the suite alone uses it (§19) | none | none |

The feed's four reshapes share one writer: new groups are inserted first; then, in
parallel, every group whose place or name changed and every thought whose group or place
changed is updated; then the groups left empty are deleted. The first failing step stops the
rest, so a group is never deleted before its thoughts have moved.

### Flows

**A page load, signed in.** `App` mounts with the screen "loading" and, before the client
exists, reads the address: `consumeAuthRedirectError` takes a failed auth redirect's error,
which becomes the login notice (§2); `consumeRecoveryToken` takes a reset link's token and
holds it (§5); a token taken, or `isPasswordRecoveryUrl`, sets the recovery route. Then it
subscribes to the recovery event and to auth changes, which creates the client. A recovery
route shows the recovery screen. Otherwise the gate runs: `getCurrentUser`; with no user,
the landing page, or the login screen when a notice is pending; with a user,
`getDashboardShellData`, then with no live project the setup, else `chooseActiveProject`
takes the seam's active id, or `App`'s copy when the seam has none, keeps it when it is still
live and picks the first live project otherwise, `setActiveProject` writes it, and the
dashboard shows. Any error anywhere in the gate shows the error screen, whose "Try again"
runs the gate again. The gate re-runs whenever the user id changes (§2), never on a token
refresh; while the recovery route is set, or the address still carries the recovery marker,
such a change shows the recovery screen instead. The recovery event sets the recovery route
and shows the recovery screen. Saving a new password on the recovery screen clears the route
and runs the gate, so the person lands in the app; asking for a new reset link clears it and
opens the login screen in its forgot mode (§5).

**A page load, on this device** (I19). The same mount, in the same order. The address is
read as above; the two subscriptions create the local client and are never called; then,
because `storesOnThisDevice()` answers yes, the recovery route and any held token are
dropped. The gate runs: `getCurrentUser` answers the local person, so the landing page and
the login screen are never reached, and the rest is as above: the sidebar's data, then the
setup or the dashboard. Every flow below runs unchanged over the local client; "the server"
in them is then this device's storage, and a read or a save fails only when that storage
cannot be read or refuses the save (§3).

**A page load, half configured** (I19). The address is read; the first subscription is the
first call that creates the client, and it throws there, inside the mount and before the
gate, so the gate's error screen is not what shows. Nothing catches the error: the page
stays blank, and the message, which names both values, is in the browser's console.

`Dashboard` mounts with the active project id and the sidebar's data, and loads the payload:
it takes a request number, blanks the cards to "Loading…", calls `getProjectDashboardData`,
and keeps the answer only when it is the latest request and for the active project
(`shouldAcceptProjectPayload`); then it bumps the tree version, which remounts the cards
through the keyed Fragment (I11). Each card copies its part of the payload with
`useServerState`. Inside the payload read, six parts run in parallel: the project row, its
phases, its learning items, its tasks, the time, and the feed, itself two reads, the
thoughts and the groups. Within the time part alone, the stale-session close runs before
the project's sessions since 48 days ago are read and bucketed into 49 entries, oldest
first, today last.

**A project switch.** The sidebar's click calls `App`, which writes the seam's active id
first and its own copy second. `Dashboard` sees the new id and loads again with a new request
number, so an older load or refresh still in flight is dropped. The sidebar stays; the cards
blank. The payload read takes the id as an argument; the Commitment card's two time reads
and every write read the seam's variable, which is already the new id by the time the new
cards exist.

**A write.** The card updates its own state first and calls the seam without waiting:
starting the clock shows it running at once, and the card turns it off when `startSession`
answers null (§8). The exceptions wait for the answer and change the screen after it: the four add boxes (§7); the setup save (§13); the
feed's group, merge, de-group, pop-out and ungroup, which replace the card's lists with the
feed the seam answers; a drop of a thought on a group; a group's rename; deleting, archiving
and restoring a project from the sidebar, and restoring one from the archive screen, after
which the gate runs again; a delete on the archive screen, which re-reads that screen's list
and runs the gate only when none remains (§6); signing out; and a stopped clock's re-read of
today's total. A successful write from a card refreshes nothing on the dashboard; an open
companion reads again, and a write made in the companion refreshes the cards quietly
(below).

**A failed save.** The seam reports it (above) before its own count drops. `App`'s listener
shows the note (§2) and starts a quiet refresh of both parts. The sidebar's part reads
`getDashboardShellData`, applies it only when it is still the latest read, and, when saves
were in flight when it started, waits for them to settle and reads once more; the failing
save is still counted at that moment, so this part reads twice. The cards' part is a counter
`App` passes to `Dashboard`; `Dashboard` reads `getProjectDashboardData` the same way, with
the shared request number, applies the payload in place by bumping the sync version, not
the tree version, so nothing remounts, and answers `App` through a callback with whether its
read succeeded; while no payload is on screen, loading or failed, the cards' part reads
nothing and answers success, and a refreshed payload that comes back empty is not applied
and counts as success. On a load, an empty payload shows the dashboard's failure line
(§7). A part whose read fails is owed: while either part is owed, the refresh of
both parts runs again when the browser comes back online, when the tab becomes visible, and
every 15 seconds, until both succeed, with no note. Signing out clears what is owed. The note's four seconds are
not restarted by a second failure.

**The companion (§23).** `Dashboard` opens the window and renders `Companion` with it, the
active project's id, and that project's name and accent from the sidebar's data. `Companion`
draws into the window's body through a portal and reads `getProjectDashboardData` for itself,
with a request number of its own. From then on the two stay in step by reading, in both
directions. Every tracked write, from a card or from the companion, ends in the seam's count
reaching zero, which calls `onSavesSettled`; the companion reads again there. And after a
write of its own, `startSession` or `stopSession` and `updateTask` whatever they answered,
`addThought` when it was kept, the companion calls back to `Dashboard`, which runs the cards' quiet refresh as for a failed save, without
the note and without the sidebar's part: the payload is read, twice when saves were in
flight, adopted in place by the sync version, and `App` is answered as after any quiet
refresh, so a read that failed is retried (§2). A write the companion sends goes to the
seam's active project, which is the project it shows.

**The clock (§8).** Instants (`started_at`, `ended_at`) are UTC strings; day keys
(`session_date`) are local days the client writes: today's for a start and for today's
edit, the edited day's for a past day's edit (I4). A session is closed at the earlier of
now and the end of its own day, with a whole number of seconds, never negative. Today's
seconds are the stored durations of today's ended sessions plus a running one counted live
under the same cap; a session left running across midnight is credited only to its own day.
`startSession` closes every running session of the user first, so one clock runs app-wide
(I3); `stopSession` closes only the project's. The stale-session close, which closes every
running session of the user dated before today, runs before every time read and before a
start, never after a stop or an edit, and reports nothing when it fails; reads stay right
because of the cap. The payload's `running` is true when any session of the project in the
window is open. The Commitment card's day roll (§8) calls `stopSession` when the clock was
running, then `listDailyTime` for 49 days.

**The setup save (§13).** The setup makes one random id per visit and sends it with every
press. `saveInterview` takes an `InterviewInput`: `setupId`, `projectName`, `totalDays`,
`hoursPlannedPerDay`, `hoursAvailablePerDay`, `phases` as a list of `{name, estDays}`, `learn`
as a list of `{name, level}`, and an `accentColor` the setup never sends. It reads the live
projects, picks the first unused accent and the next `sort_order`, rounds day counts up, and
makes one `save_interview` call with ten named parameters and no owner (I17):
`p_project_id` (uuid), `p_name` (text), `p_accent_color` (text), `p_sort_order` (integer),
`p_total_days` (integer), `p_hours_planned_per_day` (numeric), `p_hours_available_per_day`
(numeric), `p_started_at` (date), `p_phases` (jsonb, a list of `{name, est_days}`) and
`p_learning_items` (jsonb, a list of `{name, progress_pct, is_focus}`). The function runs as
the caller (§17) and writes the project, its phases and its learning items in one
transaction, the children numbered from 0 in the order given; it answers the project row.
When a project with that id already exists and is the caller's, it answers that project and
writes nothing, so a retry after a lost reply opens the project first saved; when the id is
another account's, it fails with the code `42501`.

### Sort order

| List | On add | On reorder |
|---|---|---|
| Projects | the setup: one past the highest live project's, 0 for the first; restoring from the archive: the same | `reorderProjects`: every live project's `sort_order` = its place, from 0 |
| Phases | the setup: their position from 0; `addPhase`: one past the project's highest | every phase's `sort_order` = its place, from 0 |
| Learning items | the setup: their position from 0, the first one the focus; `addLearningItem`: one past the highest | every item's `sort_order` = its place, from 0; the focus moves by a separate `setFocusItem` when it must (§10) |
| Tasks | `addTask`: one past the highest | every task's `sort_order` = its place in the stored list, from 0, finished and open rows keeping their relative places (§11) |
| Loose thoughts and groups, one sequence | `addThought`: the count of loose thoughts plus groups, so a gap left by a deletion can make a tie (§12); a new group: the place counted from the highest raw order number among the selected thoughts (§12), the rest renumbered gap-free from 0 | `reorderFeed`: every feed item's `sort_order` = its place, from 0 |
| Thoughts inside a group, their own sequence from 0 | a drop on the group: the member count; a new group: its members by their raw previous order numbers, a grouped thought's in-group number compared with a loose thought's feed number (§12); a merge: the members that stay by previous order, then the newcomers by creation time; ungroup moves the group's thoughts to the end of the feed by creation time; de-group and pop-out give the popped thoughts the count of loose thoughts plus groups as a sort key, by creation time, then renumber the feed gap-free from the keys, a thought before a group with the same key, so they land at the end unless a gap left by a deletion or a drag into a group puts a key at or below a later item's (§12); members that stay keep their numbers, gaps included | `reorderThoughtsInGroup`: every member's `sort_order` = its place, from 0 |

Every reorder is one update per row, in parallel, with no transaction; the first failure is
reported and the rows that saved keep their new places until the quiet refresh shows the
stored order.

### Rows and types

Each table has a type in `src/lib/types.ts` with the same fields in camelCase; the row
interfaces in `src/lib/transforms.ts` hold the snake_case columns, and a `fromRow` mapper per
table turns a row into its type. Five `toRow` mappers exist, for phases, learning items,
tasks, thoughts and time sessions: a field is copied when it is not undefined, null
included, and the mapper checks and clamps nothing; the clamps are the seam's, and the table
above names each (hours, days and seconds floored at 0, percents kept to 0 to 100, a name
trimmed on a rename and when a phase or a thought is added; the screens trim the rest
before sending). Projects are made only by the database function and edited by updates of one
column, or two when a project is restored; groups are inserted inline. A new thought's title is
stored as the empty string, and a null title reads as the empty string. The client never
sends `user_id` (I17), sends an `id` only for a new thought group and the setup's project,
and sends `created_at` only for a new thought group; `archived_at` is the client's clock.
Whole-number columns get whole values: the setup rounds its day counts up; a phase's days
edited on the card are rounded down by the card, then to the nearest and floored at 0 by the
seam; a percent is rounded to the nearest and clamped to 0 to 100; a closing session's
seconds are rounded down, and a hand-edited day's to the nearest. The
text limits of `src/lib/limits.ts` mirror the schema's length checks on the columns a person
types into and are enforced as the inputs' maximum length; the seam truncates nothing, and a
longer value fails the save.

### Concurrency rules

- Every write is counted from its call to its answer; `whenSavesSettle` resolves when the
  count next reaches zero, a save that starts meanwhile extending the wait. Both quiet
  refreshes read twice when saves were in flight (§7).
- Two queues, for the focus writes and the time edits; nothing else is serialized.
- Stale reads are dropped by request numbers: one in `Dashboard`, shared by its load and its
  quiet refresh, one in `App` for the sidebar's reads, one in the archive screen, one in the
  companion.
- Double submits are blocked by the add box's waiting flag, the setup's saving flag with its
  fixed identity, the recovery screen's verifying flag, the sidebar's signing-out flag, the
  Commitment card's day-roll flag, the delete confirmation's closed flag, and the archive
  screen's set of deletes still on their way (§6).
- The gate itself is not guarded: two runs can overlap, and the last to finish sets the
  screen.

### What a rebuild keeps

Nothing in these documents is marked optional. A rebuild keeps the invariants of §4, the
object model of §3, the layers, the ownership, the seam's operations with their failure
shapes and the flows of this section, both databases behind the seam with the choice between
them (I19), the desktop app of §22 with its page kept a page (I20), the companion of §23 as a second window of the same page (I21), the behavior of §5 to §15 with the copy those sections
quote, the posture of §17, the schema of §18, and the design units of `DESIGN-SYSTEM.md`.
The load-bearing clauses are the ones with IDs (§0); the rest of a section describes the app
as accepted, and a rebuild that changes any of it changes the section in the same pull
request.
