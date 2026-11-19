# Timeline card

The upper-middle bubble shows where the project is in its phases: the current phase's name, a
bar of planned calendar progress through it, and in depth the checklist of phases — tick done,
rename, set days, add, delete, drag to reorder (spec §9).

## Sub-features

- `tl-glance` "Phase 1 of 2", the current phase as the hero, the bar empty on the first day.
- `tl-glance-rename` the hero renames the current phase; an empty name keeps the old.
- `tl-depth` the checklist's head, and each row's grip, circle, name, "now", × and days.
- `tl-tick` ticking stores today and moves "now"; Commitment's Day count restarts; unticking clears it.
- `tl-rename-row` a row renames in place; an empty name keeps the old.
- `tl-days` days edit as a whole, non-negative number.
- `tl-add` "+ Add a phase" stays open for several, each last with 1 day.
- `tl-delete` × removes a phase.
- `tl-reorder` a row drags by its grip; the order persists and the current phase follows.
- `tl-all-done` every phase done: no "now", "All phases done", a full bar, Commitment "Done".
- `tl-no-phases` "No phases yet" and "—".
- `tl-calendar-bar` the bar is planned progress: 75% three days into a 4-day phase, 0% after ticking it.
- `tl-midnight-advance` the bar moves at midnight with the tab open.

## How to get to it (user POV)

- The Timeline bubble of any dashboard: the hero is click-to-rename.
- Depth shows "Phases", "{done}/{total} done" and the rows; "+ Add a phase" closes the list.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up "Path" (phases 4 and 6 days), then with the page clock
  set back "Planned" and "Overnight" (one phase of 2 days).

Run the whole recipe: `node scripts/verify/verify.mjs journey timeline`.

- **`tl-glance`.** Set up Path. By hand: `snapshot --in .bubble-timeline`. Shows "Phase 1 of
  2", "Sketch the screens" and a bar at 0%.
- **`tl-glance-rename`.** Click the hero, type, Enter; then an empty name. By hand:
  `click --in .bubble-timeline --css .glance-hero`, `fill "Sketch every screen" --css input.glance-hero-input`,
  `press Enter`, `rows phases --select name,sort_order --order sort_order`. Shows the new name
  stored and kept after the empty one.
- **`tl-depth`.** Depth. Shows "Phases 0/2 done"; the first row with its grip, "Mark phase done"
  (`aria-pressed="false"`), "now", its row marked current, "Delete phase" and "4d" titled
  "Click to edit days"; no "now" on the second.
- **`tl-tick`.** Tick the first phase, then untick it. By hand:
  `click --in .bubble-timeline --role button --name "Mark phase done" --exact --nth 0`. Shows
  "Mark phase not done" pressed, the name struck through, "now" on the second, "Phase 2 of 2",
  "1/2 done", Commitment "Day 1 / 6 · Goal 2h", `completed_at` today (`…-ticked.png`); untick
  clears it.
- **`tl-rename-row`.** Click the second name (title "Click to rename"), type, Enter; then an
  empty name. Shows the name stored and kept.
- **`tl-days`.** Click "4d" and type 5, 2.7, -3, 4 in the field "Days for …". By hand:
  `click --in .bubble-timeline --title "Click to edit days" --nth 0`, `fill 5 --role spinbutton`,
  `press Enter`. Shows 5d, 2d, 0d, 4d and the same `est_days` stored.
- **`tl-add`.** "+ Add a phase", type Polish, Enter, Ship, Enter, Escape. By hand:
  `click --role button --name "+ Add a phase"`, `fill Polish --placeholder "Name a phase, press Enter…"`,
  `press Enter`. Shows each row last, the box empty and focused between, and both stored last
  with 1 day.
- **`tl-delete`.** × "Delete phase" on Ship. Shows it gone from the card and from storage.
- **`tl-reorder`.** Drag Polish by its grip to the top, reload. By hand:
  `drag --in .bubble-timeline --css .row-handle --nth 2 --to-css "li.row" --to-nth 0 --position top`.
  Shows Polish first on screen, as the hero, after the reload and in `sort_order`.
- **`tl-all-done`.** Tick every phase. Shows no "now", "All phases done", "Phase 3 of 3", "3/3
  done", a full bar, Commitment "Done · Goal 2h".
- **`tl-no-phases`.** Delete every phase. Shows "No phases yet" and "—".
- **`tl-calendar-bar`.** Set up "Planned" with the page clock three days back, open it today,
  tick its first phase. Journey only. Shows the bar at 75% and "Day 4 / 10"
  (`…-three-days-in.png`), then the bar at 0% and "Day 1 / 6".
- **`tl-midnight-advance`.** In a visit at 23:58 yesterday, set up "Overnight" and run the page
  clock three minutes. Journey only. Shows the bar going from 0% to 50%.

## Gotchas

- The days field floors a fraction (2.7 → 2), unlike the setup, which rounds up (§13).
- The bar is planned progress from the project's start day and the preceding estimates, while
  Commitment's Day n counts from the latest completion day: they disagree on purpose.
- Clicking a row in depth never flips the view (rows count as controls); click a heading or the
  bubble's empty space to flip it.
