# Dashboard shell

The dashboard is the sidebar beside a fixed two-row main area: Commitment, Timeline and
Learning above the full-width Daily Task panel. The three upper bubbles flip together between
summary and depth; a project's cards load in one read, guarded against stale answers; a failed
save shows one calm note while the cards quietly re-read; add boxes wait for their save; every
typed box stops at its column's limit (spec §7, the note in §2).

## Sub-features

- `ds-layout` the sidebar and the two rows: three bubbles left to right above the full-width panel, no header bar.
- `ds-summary-depth` a click on any upper bubble's empty space flips all three, ▸ and ▾.
- `ds-controls-keep-view` a click on a control, or the end of a text-selection drag, leaves the view as it is.
- `ds-stale-load` a late answer for a project left behind is dropped.
- `ds-load-failed` "Couldn't load this project just now." and Try again.
- `ds-failed-save` the calm note for a failed save, the quiet re-read, the add box keeping its words.
- `ds-add-box-waits` an add box waits for its save: read-only, aria-busy, fading after half a second.
- `ds-text-limits` 4,000 characters for a task or a thought, 200 for a phase or a skill.
- `ds-semantics` aria-pressed on the panel toggle, role=slider with its value, no keyboard path for summary/depth.
- `ds-derived` remaining days, Day n from the current phase start, all phases done.
- `ds-refresh-retry` not driven: a re-read that cannot reach the server is retried on reconnect, on showing the tab and every 15 seconds; the journeys restore the connection before the next read instead of waiting for the timer.

## How to get to it (user POV)

- Any signed-in visit with a live project lands here; a pill switches the project (§6).
- A click on an upper bubble's heading or empty space flips summary ⇄ depth.
- A save fails when the connection drops; the note shows at the bottom of the window.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up Shell A (standard answers) and Shell B (phases "B one"
  2 days and "B two" 3 days, one learning item "B skill" at 30%).

Run the whole recipe: `node scripts/verify/verify.mjs journey dashboard`.

- **`ds-layout`.** Open Shell A. By hand: `setup --name "Shell A"`, `snapshot`. Shows the three
  headings in order left to right in one row, the Daily Task panel below them as wide as the
  row, and no banner.
- **`ds-summary-depth`.** Click the Commitment heading, the Learning bubble's empty corner, the
  Timeline bubble's empty corner. By hand: `click --in .bubble-time --role heading --name Commitment`.
  Shows the cues `▸▸▸`, then `▾▾▾` with "Days ⇄", "Phases" and "Skill" in place
  (`…-depth.png`), then back, then depth again.
- **`ds-controls-keep-view`.** Start and stop the clock, click the slider, click a phase row in
  depth, then drag-select the Commitment eyebrow and let go on the bubble. Shows the view
  unchanged each time, the selected text in the step's note.
- **`ds-stale-load`.** Hold Shell B's read, click B, click A before B answers, then release.
  Journey only. Shows "Loading…", then A's cards, and A still there after B's late answer.
- **`ds-load-failed`.** Drop every request to the practice copy and click Shell B. Journey
  only. Shows "Couldn't load this project just now." with the sidebar still there
  (`…-failed.png`); Try again, once the connection is back, shows B's cards.
- **`ds-failed-save`.** Drop the task saves and add "Will not be saved". Journey only. Shows
  the note "Couldn't save just now — try again in a moment." (`…-note.png`), which does not
  repeat the words; the box still holding them; no "Loading…"; no task stored; the note gone
  within about four seconds; with the connection back, Enter saves it.
- **`ds-add-box-waits`.** Hold the task save and press Enter on "A slow task". Journey only.
  Shows the words kept, `readonly`, `aria-busy="true"`, the `saving-slow` fade, typing refused
  (`…-waiting.png`); on release the task appears and the box is empty, focused and open.
- **`ds-text-limits`.** Fill 4,100 characters into the task and thought add boxes and 250 into
  the phase and skill add boxes. By hand: `click --role button --name "+ Add a task"`, then
  `fill` a long text `--placeholder "Type a task, press Enter…"` and
  `value --placeholder "Type a task, press Enter…"`. Shows each box holding exactly the first
  4,000 or 200 characters.
- **`ds-semantics`.** Read the panel toggle and the slider. By hand:
  `snapshot --in .bubble-task`, `snapshot --in .bubble-learning`. Shows Task list pressed and
  Thought log not, the slider named "Progress for B skill" with min 0, max 100 and a value, and
  no bubble taking keyboard focus.
- **`ds-derived`.** On Shell A, tick the first phase, the second, then untick it. Shows the
  Commitment eyebrow "Day 1 / 10 · Goal 2h", "Day 1 / 6 · …", "Done · Goal 2h", "Day 1 / 6 · …".

## Gotchas

- A click "outside" to clear a selection or close a panel must land on the sidebar's empty
  space; on a bubble it flips the view.
- After the load-failure step the journey is on Shell B; the later steps read B's names.
- Dropped requests make the browser print `Failed to load resource: net::ERR_…` and the seam
  print `[compass] a save failed: …`; only the fault steps allow them.
- The note is a `role="status"` at the window's bottom and goes after about four seconds; read
  it right after the failed save.
