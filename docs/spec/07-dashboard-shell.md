## §7 Dashboard shell

Code: `src/dashboard/Dashboard.tsx`, `src/dashboard/dashboardLoad.ts`, `src/dashboard/useServerState.ts` · Keeps: I11

`src/dashboard/Dashboard.tsx` renders the sidebar (§6) and the main area: a fixed two-row
layout with no header bar — three orientation bubbles in a row (Commitment §8, Timeline §9,
Learning §10) above the full-width action panel (Daily Task §11 / Thoughts §12). The layout
is the same on every visit (principle 3).

**Summary ⇄ depth.** One shared state flips all three upper bubbles at once; the action
panel is always full. Clicking the negative space of any upper bubble toggles it. A click on
a control — anything matching `button, input, select, textarea, a, .cslider, .row` — never
does, and neither does a click that ends a text-selection drag (a live selection with actual
text; a whitespace-only selection does not block it). Each bubble header shows a ▸ (summary) or ▾ (depth) cue. In depth the upper row
grows to hold the expanded content; nothing opens in a drawer, modal or overlay.

**Loading.** The sidebar's data (projects, archive, per-project completion) is loaded once by
the gate, survives project switches, and is re-read in place after a failed save (§2). The
active project's payload — project, phases, learning items, tasks, the last 49 days of
time, the thought feed — is loaded by the dashboard in one seam call for the requested id,
so switching projects blanks only the cards ("Loading…"). A stale-request guard accepts a payload only if it is the latest request and
still for the active project. Each accepted load remounts the card tree through a keyed
Fragment (I11), so per-card state never leaks across projects or reloads. A failed read,
or a payload that comes back empty because the project row is missing, shows "Couldn't
load this project just now." with "Try again".

**After a failed save.** The gate's note shows (§2) and the cards are refreshed quietly: the
payload is re-read and the mounted cards adopt it in place. Nothing blanks, neither
"Loading…" nor the load failure appears, every box open for typing keeps its text, cursor
and selection, and a selection of thoughts survives, less any thought that no longer exists.
If saves were still on their way when the refresh started, it reads once more after they have
all ended, so a save that lands late is not shown stale. A drag in progress stays in hand
while the other rows take their saved places, and its drop lands where it is let go. A
refresh that cannot reach the server leaves the cards as they are until a retry succeeds
(§2).

**Typing and adding.** Every box where a person types something Compass saves stops at the
limit of its column (§3) — 200 characters for a name or a title, 4,000 for a task's or a
thought's text — and a longer paste keeps its first part. The four "+ Add …" boxes (§9–§12)
wait for their save: after Enter, or a click away, the words stay in the box, which takes
no typing and does not close until the save answers; after Enter it keeps the cursor, so
the next entry can follow as soon as the box clears. If that takes
more than half a second the box fades, as a busy login field does (DS §9.1). On success it
clears and stays open for the next entry; on failure the same words are still there and
nothing is added. There is no time-out: a box whose save never answers keeps waiting, because
a save given up early that then landed late would add the item twice.

**Keyboard and assistive tech.** The segmented controls, the Learning slider and the landing
demo's view toggle carry state semantics (`aria-pressed`, `role="slider"`); the Days⇄Weeks,
Projects⇄Archive and demo-hotspot toggles do not, though the demo hotspots have accessible
names (§15). Each upper card's summary/depth toggle is a click on the card itself and has no
keyboard path. Drag-reorder is pointer-only everywhere — there is no keyboard path for
reordering pills, phases, learning items, tasks or thoughts.

**Derived for the cards.** The current phase start (the latest completion day among done
phases, else the project's start day), the remaining days (the sum of estimated days over
unfinished phases), and whether all phases are done (at least one phase, every one done) are
computed here and passed down.
