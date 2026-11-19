## §13 Interview (setup)

Code: `src/interview/Interview.tsx`, `supabase/migrations/0002_save_interview.sql`, `src/styles/interview.css` · Keeps: I4, I13

The one-page setup that creates a project. Answering it is the cognitive warm-up: no question
can be skipped, and a foggy first guess is worth more than a dodged one. It opens on first run
(no live project) and from "+ New project" in the sidebar (§2). It works for a project already
in progress — the phase the user is in becomes phase one, and no copy assumes the project is
new.

**Layout.** A form column (up to 720 px wide) beside a sticky five-step progress rail; on
narrow viewports the rail folds under the form. The header carries the "Compass" wordmark.
"← Back" (top left) appears only when the user already has a live project; "View archive (N)"
(top right) appears only when the archive holds N > 0 projects and opens the archive screen
(§6).

**Fields, in order.**

1. **Project** — "Name this project" (200 characters at most, like every name field here).
2. **Time** — "Estimate your schedule.": "How many hours would you like to spend on it each
   day?" (hours/day, half-hour steps from 0.5), "How much time do you actually have available
   each day?" (hours/day), "How long do you think this project will take? (work more in
   designing timeline)" (days, from 1).
3. **Timeline** — "Sketch the path from here to done.": repeat rows of phase name (placeholder
   "e.g. create the design mockup") and days; two rows to start; "+ Add a phase".
4. **Learning** — "List the things you need to learn to best move forward.": repeat rows of
   item name (placeholder "e.g. learning UI design principles") and a starting level; two rows
   to start; "+ Add something to learn".

Repeat rows drag-reorder within their own list: the whole row is draggable (grip, label or
padding), and only a press that starts on an input, select or button is ignored. × removes a row; the last remaining row of a list cannot be
removed. Starting levels: "Beginner · ~10%", "Some basics · ~30%", "Comfortable · ~50%",
"Confident · ~65%", "Almost fluent · ~80%" — the number becomes the item's starting progress.

**Progress rail** ("Setup progress"; each step is labelled "{step}: {status}" and the active
one carries `aria-current="step"`). Project completes when the name is non-empty; Time when all three numbers
are above zero; Timeline when every row has a name and days above zero; Learning when every
row has a name and a level. The fifth step, Dashboard, is never ticked: it becomes the active
step once the other four are complete. Each step is colored with its module accent.

**CTA.** "Open my dashboard →" sits in the rail and is enabled only when all four steps are
complete; it reads "Opening…" while saving. Until then a line beneath it says "Just a little
more — {missing}." where missing is the first that applies of "name your project", "add your
project length and daily hours", "note how many hours you actually have", "complete every
timeline phase", "complete every learning item".

**What opening writes** (one seam call, `saveInterview`): a project named from the trimmed
field (fallback "My project"), with `started_at` = today's local day (I4), the next sidebar
`sort_order`, and an accent color chosen by the seam (§3); the phases in the entered order;
the learning items in the entered order with progress seeded from the level and the first
item as the focus. Only named rows are sent. Every day count — the project's length and each
phase's days — is stored whole, a fraction rounded up (2.5 → 3, 0.5 → 1). The new project
becomes the active one and the gate opens its dashboard.

**All or nothing.** After one read of the live projects (for the accent and the place), the
project, its phases and its learning items are saved by one database function,
`save_interview` (§18), in a single transaction: a refusal of any part, or a connection lost
before the database finishes, keeps nothing. Each visit to the setup screen makes one
identity when it opens and sends it with every press; it becomes the new project's id. A
save whose identity already made a project writes nothing and opens that project as it was
first saved, whatever the answers now say — so a press after a reply that never arrived opens
the project already saved, and a visit makes at most one project; a new visit makes a new
one. When a save fails, the CTA reads "Open my dashboard →" again, every answer stays as
typed, and the note from §2 shows; while a save is on its way the CTA stays on "Opening…",
for as long as it takes, and ignores further presses. If only the reply was lost, the quiet
refresh (§2) finds the saved project, so a first-run screen then offers "← Back" to it.
