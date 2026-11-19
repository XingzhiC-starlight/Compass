## §11 Daily Task panel

Code: `src/dashboard/TaskPanel.tsx`, `src/dashboard/useAddBox.ts`, `src/dashboard/useDragReorder.ts` · Keeps: I10, I13

The full-width lower panel (`src/dashboard/TaskPanel.tsx`), titled "Daily Task", is the
action surface: always full and edited in place, with no summary state. A two-button group in
its header ("Task list" / "Thought log") switches the panel to the thought log (§12); both
views stay mounted, so switching never loses in-progress edits, scroll or selection.

- Task text renders in the task font, Libre Baskerville (`DESIGN-SYSTEM.md` §3.2). The list
  shows every task of the project in the user's order. Finished tasks sink to the
  bottom as a display-only stable sort: the persisted order is untouched, and unchecking
  returns a task to its place.
- "+ Add a task", the last row, opens a growing text field ("Type a task, press Enter…") that
  stays open after each Enter so several tasks can be typed in a row, each waiting for its
  save (§7). A new task goes last and is stamped with today's local day as provenance only
  (I10). Task text stops at 4,000 characters, here and in the edit field.
- Each row, left to right: a drag grip, a check button ("Mark task complete" / "Mark task
  incomplete"), the text (click to edit in place, "Click to edit"; blur or Enter commits,
  Escape cancels, empty leaves it unchanged; when the save fails, the field reopens with
  the words typed, without taking the cursor, so more than one can be open), and × ("Delete
  task"). The header group is labelled "Switch panel view".
- Enter submits in both the add and the edit field, Shift+Enter included (I13); multi-line
  text still displays in full because the field auto-grows.
- Rows drag-reorder by the grip only; the order persists. While a task is dragged, the list
  scrolls at its top and bottom edges by the thought log's rule (§12), so a task can be
  moved past what is visible, and its drop lands where it is let go.
- A drag reorders the unfinished tasks among themselves, or the finished ones among
  themselves, whichever the dragged task is. Every task of the other kind keeps its stored
  place, so a finished task still returns to its place when unchecked. A task let go among
  the other kind lands at the nearest end of its own.
- Tasks persist across days, finished and unfinished, until the user deletes them; the list
  is never cleared or filtered by date.
