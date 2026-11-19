# Interview (setup)

The one-page setup that creates a project: a name, the hours and length, the phases and the
things to learn, with a progress rail whose button opens the dashboard only once every answer
is given. One database call saves it all or nothing, and a visit makes at most one project
(spec §13).

## Sub-features

- `iv-first-run` no ← Back and no View archive on first run; the sections, two rows each, the five levels.
- `iv-progress-rail` the rail's step labels and aria-current, the disabled button and the hint naming what is missing, in order.
- `iv-rows` rows are added, removed, and the last one of a list cannot be removed.
- `iv-drag-rows` a repeat row drags within its list.
- `iv-open` "Opening…", the dashboard, and what is stored: trimmed name, today, whole days rounded up, order, levels, first item as focus.
- `iv-new-project` "+ New project" offers ← Back, which saves nothing.
- `iv-second-project` a second project goes after the first with the first free accent color.
- `iv-view-archive` "View archive (1)" opens the archive screen; its ← Back returns to the dashboard.
- `iv-save-fails` a dropped save keeps every answer and the note, keeps nothing; the next press saves once.
- `iv-reply-lost` a save whose reply is lost: pressing again opens the project already saved, exactly one.

## How to get to it (user POV)

- Signing in with no live project opens it (the first run).
- "+ New project" at the bottom of the sidebar's pills.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey signs in its own account, which owns no project.

Run the whole recipe: `node scripts/verify/verify.mjs journey interview`.

- **`iv-first-run`.** Sign in. By hand: `account`, `sign-in`, `snapshot`. Shows "Open my
  dashboard →", no ← Back, no View archive, the brand "Compass", the textbox "Project" with
  placeholder "Name this project", the headings Time, Timeline, Learning with their prompts, two
  phase rows, two learning rows, and the levels "Starting level…", "Beginner · ~10%", "Some
  basics · ~30%", "Comfortable · ~50%", "Confident · ~65%", "Almost fluent · ~80%".
- **`iv-progress-rail`.** Answer one thing at a time: the name (with spaces around it), hours
  and length 9.5, available hours, both phases (2.5 days and 4), both items. By hand:
  `snapshot --in .progress-rail`. Shows the rail's items read "Project: active", then
  completed in turn, the active one `aria-current="step"`; the hint goes "name your project",
  "add your project length and daily hours", "note how many hours you actually have", "complete
  every timeline phase", "complete every learning item", then disappears with "Dashboard:
  active" and the button enabled.
- **`iv-rows`.** "+ Add a phase" and remove it; "+ Add something to learn", remove down to one,
  add it back. By hand: `click --role button --name "+ Add a phase"`,
  `click --role button --name "Remove phase" --nth 2`. Shows Timeline active again while a row
  is empty, and the last learning row's "Remove item" disabled (`…-last-row.png`).
- **`iv-drag-rows`.** Drag the second phase row by its grip above the first, and back. By hand:
  `drag --css ".phase-row .grip" --nth 1 --to-css ".phase-row" --to-nth 0 --position top`.
  Shows the two names swapped, then back.
- **`iv-open`.** Press "Open my dashboard →" with the save held. Shows "Opening…" disabled
  (`…-opening.png`), then First setup active on the dashboard; stored: name "First setup",
  `started_at` today, `total_days` 10, hours 2 and 3, `sort_order` 0, accent `#9A7B4F`, phases
  "Plan the pages" 3 days and "Build the pages" 4, items Layout 10% (focus) and Colour 80%.
- **`iv-new-project`.** "+ New project", type a name, ← Back. Shows First setup again and still
  one project stored.
- **`iv-second-project`.** "+ New project", answer, open. Shows Second setup active after First
  setup, stored with `sort_order` 1 and accent `#7BC8B2`.
- **`iv-view-archive`.** Tick every phase of Second setup and archive it; "+ New project".
  Shows "View archive (1)", the archive screen listing it, and ← Back to the dashboard.
- **`iv-save-fails`.** Answer "Lost connection" with the save dropped, press, then press again
  with it back. Journey only. Shows the note, the button enabled, every answer kept
  (`…-refused.png`), nothing stored; then exactly one "Lost connection".
- **`iv-reply-lost`.** Answer "Reply lost" with the save sent but its reply dropped, press, then
  press again. Journey only. Shows the note and the setup still there while one project is
  already stored; the second press opens that same project, still one.

## Gotchas

- The save is one call to `/rest/v1/rpc/save_interview`; the journey holds, drops or loses the
  reply of that call alone.
- "Time" also matches "Timeline" unless matched exactly; the rail's items are found by their
  label's start ("Time: ").
- Days are rounded up here (2.5 → 3) but floored in the Timeline card's days field (§9).
- The accent is the first palette color no live project uses: archived projects free theirs.
