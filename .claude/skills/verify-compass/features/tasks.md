# Daily Task panel

The full-width lower panel is the action surface: a list of every task of the project in the
user's order, added from a box that stays open, ticked (finished tasks sink on screen only),
edited in place, deleted, dragged by the grip, and kept across days (spec §11).

## Sub-features

- `tk-panel` "Daily Task" and the "Switch panel view" toggle.
- `tk-add` "+ Add a task" stays open; Enter and Shift+Enter add; stored last with today's day; in Libre Baskerville.
- `tk-check` a ticked task sinks to the bottom on screen only; unticking returns it.
- `tk-edit` a task edits in place: Enter or a click away stores, Escape cancels, empty keeps it.
- `tk-edit-fails` a failed edit reopens with the words typed, without the cursor.
- `tk-long-text` the add field grows with long text, and the saved task shows in full.
- `tk-delete` × removes a task.
- `tk-reorder` a task drags by its grip; the order persists.
- `tk-reorder-finished` a drag leaves a finished task in its stored place, and unticking it returns it there.
- `tk-across-days` a task from yesterday is still listed today, finished or not.
- `tk-edge-scroll` dragged to the list's bottom edge the list scrolls, stops in the middle, and the drop lands where let go.
- `tk-views-stay-mounted` the list's scroll and the thought log's selection survive switching views.

## How to get to it (user POV)

- The lower panel of any dashboard, "Task list" pressed in its header toggle.
- "+ Add a task" is the list's last row; each task's text is click-to-edit; the grip, the check
  and × sit on its row.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up "Tasks".

Run the whole recipe: `node scripts/verify/verify.mjs journey tasks`.

- **`tk-panel`.** Set up Tasks. By hand: `snapshot --in .bubble-task`. Shows the heading "Daily
  Task" and the group "Switch panel view" with Task list pressed.
- **`tk-add`.** Add First task and Second task with Enter, Third task with Shift+Enter. By hand:
  `click --role button --name "+ Add a task"`, `fill "First task" --placeholder "Type a task, press Enter…"`,
  `press Enter`, `rows daily_tasks --select text,is_done,task_date --order sort_order`. Shows the
  three in order in Libre Baskerville, stored undone with today's day.
- **`tk-check`.** Tick First task, then untick it. By hand:
  `click --in .bubble-task --role button --name "Mark task complete" --nth 0`. Shows "Mark task
  incomplete" pressed, the row checked and last on screen (`…-ticked.png`) while the stored
  order keeps it first; unticking returns it.
- **`tk-edit`.** Click Second task's text (title "Click to edit"), change it, Enter; Escape;
  empty; then Third task by a click away. Shows the two edits stored and the others ignored.
- **`tk-edit-fails`.** Drop task edits, edit First task, Enter. Journey only. Shows the note and
  the field open again with the words typed but not focused (`…-reopened.png`); with the
  connection back, Enter in it stores them.
- **`tk-long-text`.** Fill twelve repeats of a phrase into the add box, Enter. Shows the box
  more than twice its height with nothing hidden, and the saved task showing every word.
- **`tk-delete`.** × "Delete task" on the long one. Shows it gone and three stored.
- **`tk-reorder`.** Drag Third task by its grip to the top, reload. By hand:
  `drag --css ".task-item .task-handle" --nth 2 --to-css "li.task-item" --to-nth 0 --position top`.
  Shows the new order on screen, after the reload and stored.
- **`tk-reorder-finished`.** Tick Third task, drag Second task above First task, untick Third
  task, reload. By hand: `click --in .bubble-task --role button --name "Mark task complete" --nth 0`,
  `drag --css ".task-item .task-handle" --nth 1 --to-css "li.task-item" --to-nth 0 --position top`,
  `rows daily_tasks --select text,is_done --order sort_order`. Shows Third task last on screen
  but still stored first after the drag (`…-dragged.png`), and back at the top once unticked,
  also after the reload.
- **`tk-across-days`.** In a visit with the page clock a day back, add and tick "From
  yesterday"; then sign in on a visit of today. Journey only. Shows it stored with yesterday's
  day, and listed today, still ticked, last.
- **`tk-edge-scroll`.** Add 22 tasks, drag Third task to within 20 px of the list's bottom and
  rest there, move to the middle and rest, let go. Journey only. Shows the list scrolled (the
  note gives how far), no further scroll in the middle, and the task landed beside the row it
  was let go over, with the unfinished tasks stored in the order shown.
- **`tk-views-stay-mounted`.** Add two thoughts and select both, scroll the task list to 240 px,
  switch back and forth. Shows "2 selected" kept in the thought log and the task list still at
  240 px.

## Gotchas

- Text typed in an add box is saved by a click away: switching to the thought log saves it, so
  in-progress words do not survive a switch — scroll and selection do.
- Enter and Shift+Enter both submit; a line break never reaches a task through the keyboard.
- The driver sends a drag's dragover only on a move and not every one reaches the page; the
  journey rests the pointer with a one-pixel jitter (`holdDrag`). Without it the list may not
  scroll, or a drop may not land.
- Adding many tasks scrolls the list to its bottom; set it back to the top before a drag.
