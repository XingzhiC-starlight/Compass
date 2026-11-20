## §23 The companion

Code: `src/companion/Companion.tsx`, `src/companion/companionSummary.ts`, `src/companion/companionWindow.ts`, `src/dashboard/Dashboard.tsx`, `src/dashboard/Sidebar.tsx`, `src/dashboard/projectTime.ts`, `desktop/main.ts`, `desktop/appFiles.ts` · Keeps: I1, I3, I13, I20, I21

The companion is a small second window that stays beside the person's other work: the active
project's clock, and on a press the other three cards in short, with a box for a thought. It
shows what the dashboard shows and saves what the dashboard saves; it holds nothing of its
own (I21). It is the same in a browser and in the desktop app; what the desktop app adds is
that its window always stays above every other window, and on a Mac shows on every desktop
and beside a full-screen app (§22). In a browser only a picture-in-picture window stays on
top.

### Opening and closing it

The sidebar's **Companion** button, above Settings (§6), opens it. There is one companion: a
press while it is open brings that window forward and opens no second one, and the button
carries the class `active` while it is open. The dashboard owns the window
(`src/dashboard/Dashboard.tsx`): it stays open across a project switch and a reload of the
cards, and shows the active project and no other, drawn while that project is among the
sidebar's live ones. It closes when the person closes it, when the dashboard leaves the
screen, as it does for a new project's setup and on signing out, and when the page itself
goes. A window the browser refuses to open shows nothing and says nothing; the button can be
pressed again.

### Its window

`openCompanionWindow()` in `src/companion/companionWindow.ts` opens it, 300 wide and 250 high. A press
on the button opens it from inside the press, which a browser asks of a page that opens a
window; the desktop app's asking for a thought (below) opens it with no press, which the app
allows:

- in a browser that has document picture-in-picture windows, one of those, which the browser
  keeps on top;
- otherwise, and when the picture-in-picture window is refused, a plain popup,
  `window.open("", "compass-companion", "popup=yes,width=300,height=250")`;
- in the desktop app always the second, whatever the page offers, because the app knows the
  companion by that name (§22).

Either way the window opens empty, at `about:blank`, and it is not a second page: the
dashboard draws the `Companion` component into the window's body through a React portal, so
the companion runs in the main page, reads the same seam (I1) and passes nothing between two
programs. Before anything is drawn, `prepareCompanionDocument` gives the empty document the
title "Compass Companion", the page's language, a `<base>` at the page's own address, a copy
of the rules of every stylesheet the page has (a sheet whose rules cannot be read is linked
instead), and the class `companion-body` on its body. That copy is how the design system
reaches it (DS §9.6). A window found again by its name, already made ready, is left as it
is. The companion wears the dashboard's theme (§14): while the window is open the dashboard
keeps the root of the window's document marked as the page's own root is (`followTheme`,
`data-theme="sand"` or no mark), copied as the window opens and again after every change.

### The clock

The window opens showing one card, the Commitment card's glance (§8) in small:

- the project's accent dot and its name, on one line, cut with an ellipsis; both come from
  the sidebar's data, so a rename shows at once;
- a ▸ at the right, ▾ when the summary is open, which is a button: "Show the timeline,
  learning and tasks" and "Show the clock alone";
- the Commitment card's own line, "Day 3 / 12 · Goal 5h" or "Done · Goal 5h"
  (`commitmentEyebrow` over `phasePacing`, the functions the card itself uses), and "Today"
  until the first reading arrives;
- the clock button, "Start work session" or "Stop work session", and today's time on the
  project, labelled "Time today". Where the card writes hours, the companion writes a clock's
  face (`formatClock`): minutes and seconds, `0:00` and `4:05`, with the hours in front from
  one hour on, `1:04:05`;
- a bar in the Time accent, the share of the daily goal done, rounded to a whole percent,
  never past full and empty with no goal (`goalPct`).

The time is kept as a reading and the moment it was taken, `{baseSeconds, baseAtMs, running,
date}`, and what shows is the reading plus the whole seconds since (`clockSeconds`), so a
tick that fires late still shows the right time. While the clock runs the companion's own
window ticks it once a second; a hidden main window's timers run late, the companion's do
not.

A press on the clock button flips the clock at once, from the time showing, and saves through
the seam: `startSession` or `stopSession`, the same writes the Commitment card sends, so
starting here closes a clock running on another project (I3). When the save has answered,
kept or refused, the dashboard is told and both windows show what is stored (below).

### The summary

A press on the card, anywhere but on a button, a field or a link, and not one that ends a
selection of text, opens the summary; so does the ▸ button, which gives it a keyboard path. A
second press closes it. The window grows to 640 high and returns to 250, where the window
allows it; a window that will not be resized shows the same companion at the size it has.
Opening it takes a new reading. Until the first reading has arrived it shows "Loading…".

Three cards in short, each an eyebrow, a line of at most two lines and a bar in the card's
accent, except the tasks, which are a list:

- **Timeline** (§9): "Phase 2 of 5", or "No phases yet"; the current phase's name, "All
  phases done", or "—" with no phases; the bar is how far the elapsed days reach into the
  current phase's planned days (`timelineGlance`, the Timeline card's own).
- **Learning** (§10): "40% · Focus", or "No focus set"; the focus item's name, or "Add
  something to learn"; the bar is the item's percent (`learningGlance`, the Learning card's
  own).
- **Tasks** (§11): "Tasks · 1 of 3 done", or "Tasks · none yet"; then up to four tasks, each
  with its check, "Mark task complete" or "Mark task incomplete". Which tasks are listed is
  decided when a reading arrives (`listedTaskIds`). A reading taken as the companion opens,
  as the summary is opened, on a project switch or on a new day lists the first four open
  tasks in list order. A reading taken because saves have settled keeps the tasks already
  listed that still exist, done or not, and fills the places left with open ones. So a task
  ticked here, which is saved with `updateTask` and struck through, keeps its place and does
  not vanish under the pointer, and a task added on the dashboard appears while there is
  room. With no tasks the card says "Add tasks in Compass"; with tasks and none to list,
  "All caught up"; and when more are open than are listed, "2 more open in Compass".

Nothing else is done here: no name is edited, nothing is added but a thought, and nothing is
reordered or deleted. Those are the dashboard's.

### A thought

Under the summary, while it is open, is one box, "Add a thought", with the placeholder
"Capture a thought…", stopping at a thought's 4,000 characters (§3). Enter saves it, by the
rule every field follows (I13): the text is trimmed and an empty box saves nothing; the box
empties at once; `addThought` puts it in the active project's thought log (§12). When the
save has been kept, the placeholder reads "Saved to the thought log" for 2.4 seconds. A save
that is refused shows no such line and puts the words back in the box, unless the person has
typed new ones since.
A switch to another project empties the box: nothing typed for one project is filed under
another.

In the desktop app a thought can be asked for from anywhere, by the capture keys or the
menu's line (§22). The dashboard hears it (`onCaptureAsked` in
`src/companion/companionWindow.ts`; in a browser nothing ever asks), opens the companion or
brings it forward, and counts the asking for it; each new count opens the summary if it is
closed, growing the window, and puts the cursor in this box. The count starts again when the
companion closes, so one opened later by its button opens small. When the window is refused,
nothing is counted.

### The other lines

Whenever a save fails, here or on the dashboard, the companion shows "Couldn't save just now
— try again in a moment.", the words of the gate's note (§2), since the note in the main
window may be out of sight. It shows for four seconds after the latest failure: unlike the
gate's note, a second failure while it shows starts the four seconds again.

At the bottom, whether the summary is open or not, **Open Compass** brings the main window forward (`showCompass`): the page
focuses itself, and in the desktop app, where the main window may be hidden and a page cannot
show a hidden window, it first asks the app through the bridge's `show` (§22).

### Staying in step

The companion keeps a reading of its own, the active project's payload from
`getProjectDashboardData` (§21), and never a copy handed over by the dashboard. It takes a
reading:

- when it opens, and when the active project changes. A change of project first clears what
  it holds, the reading, the clock, the listed tasks, the thought box and its "Saved" line, so until the new
  reading arrives the line reads "Today", the clock shows `0:00` and stopped, and an open
  summary shows "Loading…";
- every time the last save in flight has answered, wherever the save came from, through the
  seam's `onSavesSettled` (§21); this is how a task added or a clock stopped on the dashboard
  reaches the companion with no press there;
- when the summary is opened;
- once the local day has changed, looked at once a minute, so past midnight the day's time
  and the day count start again (I4).

A reading that has been overtaken by a later one is dropped, and one that fails leaves the
last reading showing until the next. In the other direction, the companion asks the dashboard
for a quiet refresh (§7) after a save of its own: after the clock's and a task's save has
answered, kept or refused, and after a thought that was kept. A thought that was refused is
not asked for here; the gate's refresh after any failed save covers it (§2). The payload is
read again and the mounted cards adopt it in place, with every open box kept. So neither
window is told what changed; each reads what is stored.

### What checks it

- The pure parts, in the suite (§19): `src/companion/companionSummary.test.ts` (the clock's
  reading and face, the goal's share, the task heading and which tasks are listed),
  `src/dashboard/projectTime.test.ts` (the lines and bars the cards and the companion share)
  and `src/companion/companionWindow.test.ts` (the document made ready, which window is
  asked for, and bringing the main window forward).
- `src/companion/Companion.test.tsx` draws the companion into a document with the seam stood
  in for: the clock and its presses, the reading taken again when saves have settled and past
  midnight, the summary, a ticked task, a thought kept, refused and not carried to another
  project, the failed-save note and Open Compass.
- `src/dashboard/the-companion-belongs-to-the-dashboard.test.tsx` renders the dashboard with
  the window stood in for: one window, brought forward on a second press; it follows a
  project switch; a save made in it makes the cards adopt a new reading in place; closing it,
  leaving the dashboard and the page going each end it; a refused window shows nothing.
- `src/lib/db/saves-in-flight.test.ts` holds `onSavesSettled` to once per settling, kept or
  refused, never for a read.
- The desktop check (§22) opens the real companion from the real sidebar and walks the clock,
  the summary, a task, a thought and Open Compass in both windows, with the data file read
  after each.

Checked by no test: the picture-in-picture window in a real browser, and where the window
sits on a real desktop.
