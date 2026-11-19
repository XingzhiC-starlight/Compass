# Compass verification map

This folder is the maintained source for proving Compass's user-facing behavior. One file per
spec section from §5 to §15, each the recipe for one journey under `scripts/verify/journeys/`
and named after it. Read this index, then the feature file of the section a change touches.

## Baseline preconditions

- Docker is running and the Supabase tool is installed (README, "Running it"); Chromium for
  Playwright was downloaded once (`npx playwright install chromium`).
- A run is launched from the checkout under test: `node scripts/verify/verify.mjs launch`, and
  `node scripts/verify/verify.mjs doctor` prints `ok` on every line. `prove` does both itself.
- The practice app answers at http://localhost:5183, started by this run, pointed at the
  practice copy, with no CAPTCHA key. Nothing else is driven.
- Each journey starts from a fresh made-up account with no project, signed up through the
  practice copy's sign-up, and from a fresh browser context (nothing signed in, nothing stored
  in the browser).

## Driving conventions

- Find things as a person does: role and accessible name first, then label, placeholder, title
  and visible text; a class name only where nothing better exists (`screens.mjs` lists them).
- The dashboard's four bubbles are `.bubble-time` (Commitment), `.bubble-timeline`,
  `.bubble-learning` and `.bubble-task` (Daily Task and Thoughts); `--in` scopes a hand command
  to one of them.
- A journey's steps run in order and share what earlier steps made; a single step cannot be run
  alone. To check one behavior quickly, drive it by hand with the commands in its file.
- The journeys use the standard setup answers unless a step says otherwise: hours 2 a day,
  3 available, 10 days; phases "Sketch the screens" (4 days) and "Build the first page"
  (6 days); learning "Layout basics" (Beginner, 10%) and "Colour" (Some basics, 30%).
- Steps that need a dropped connection, a held request or another day are journey-only: the
  hand commands have no network faults and no clock.

## Proof and skip reporting

- Proof is the action and the state it leaves: the step's picture and outline, and for a save
  the rows read back as the signed-in account (`NN-<step>.rows.json`).
- A step that says nothing happened (nothing sent, stored or moved) watches for it, and that
  check has been shown able to fail.
- Report a failed step with its id, its error line and its picture from `report.md`; report
  every step after it as not run, never as passed.
- A behavior marked "not driven" names why; it is not proven by this map and stays with what
  the file says does prove it (the live site, a unit test).

## Feature entry contract

Each feature file starts with an H1 and one paragraph on the behavior, then exactly four H2s:

1. `Sub-features` — one line per behavior, starting with its id in backticks; the id is the
   journey step that proves it, or the line says "not driven" and why.
2. `How to get to it (user POV)` — every way a person reaches it.
3. `Driving it with verify.mjs` — `Preconditions:`, the journey command, then one labeled
   bullet per step: the action, the hand commands that redo it where they can, and what shows
   it worked.
4. `Gotchas` — what can waste or invalidate a run.

`node scripts/verify/verify.mjs map` checks that every step is listed and every listed id is a
step or marked not driven.

## Features

- [Auth](./auth.md) — §5: the login screen's modes, the password rules, register, sign in and
  out, the reset email and its link, the failed-redirect notices.
- [Projects, sidebar and archive](./sidebar.md) — §6: pills, switching, renaming, reordering,
  the delete confirmation, archiving, the Archive view and the archive screen.
- [Dashboard shell](./dashboard.md) — §7: the layout, summary ⇄ depth, loading and its failure,
  the failed-save note, the waiting add boxes, the text limits.
- [Commitment card](./commitment.md) — §8: the goal and today's hours, the work-session clock,
  the history in days and weeks, past days, the day boundary.
- [Timeline card](./timeline.md) — §9: phases, the current phase, ticking, days, reordering,
  the calendar bar.
- [Learning card](./learning.md) — §10: the focus slider, the roadmap, completion and the focus
  rules.
- [Daily Task panel](./tasks.md) — §11: adding, ticking, editing, reordering, tasks across
  days, the edge scroll.
- [Thought log](./thoughts.md) — §12: thoughts, titles, groups, merge, de-group, pop-out,
  ungroup, dragging, the edge scroll.
- [Interview (setup)](./interview.md) — §13: the first run, the progress rail, the rows, what
  opening stores, a save that fails or loses its reply.
- [Settings and privacy](./settings.md) — §14: the Settings dialog, the privacy notice, log
  out, the page head.
- [Landing page](./landing.md) — §15: the sections, the demo and its controls, the narrow
  screen, reduced motion, the Log in pills.
