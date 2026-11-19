# Thought log

The Daily Task panel's second view, "Thoughts": a free-form feed of loose thoughts and named
groups. Thoughts get optional titles, edit in place, select into a group, merge into one, pop
back out, and drag within the feed, within a group or onto a group (spec §12).

## Sub-features

- `th-view` the "Thoughts" view and its last row "+ Add a thought".
- `th-add` Enter and Shift+Enter add loose thoughts, in the thought font, stored with no group.
- `th-hover` the checkbox and the empty title are hidden until the row is hovered.
- `th-title` a title is added on Enter or Shift+Enter and stored; an empty title clears it.
- `th-edit-body` Shift+Enter breaks the line, Enter stores; unchanged text writes nothing.
- `th-edit-fails` a failed body edit reopens with the words typed, without the cursor.
- `th-delete` × removes a thought.
- `th-group` two selected thoughts: the bar, Group, the name field, the dashed group "2 thoughts".
- `th-untitled` a group dismissed without a name is "Untitled group".
- `th-select-all` the group's checkbox is mixed while some members are selected, and selects them all.
- `th-same-group` Group on one whole group writes nothing and closes the bar.
- `th-merge` a whole group plus a loose thought: Merge moves it in, the name kept.
- `th-degroup` De-group moves the selected members to the bottom; the group stays with the rest.
- `th-pop-out` the per-row pop-out; a group left empty disappears.
- `th-ungroup` Ungroup dissolves a group to the end of the feed, in creation order.
- `th-reorder` a loose thought, a group and a thought inside a group drag to new places; the order persists.
- `th-into-group` a loose thought dropped on a group's header joins it, stored last.
- `th-clear` × in the bar clears the selection.
- `th-edge-scroll` dragged to the feed's bottom edge it scrolls, stops in the middle; Escape cancels the drag.

## How to get to it (user POV)

- "Thought log" in the Daily Task panel's header toggle.
- Hovering a thought shows its checkbox, grip, title and ×; a grouped thought also shows the
  pop-out. A group's header holds its checkbox, grip, count, name and Ungroup.
- Two or more selected thoughts open the action bar at the bottom.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up "Thinking" and works in its thought log.

Run the whole recipe: `node scripts/verify/verify.mjs journey thoughts`.

- **`th-view`.** Thought log. By hand: `click --in .bubble-task --role button --name "Thought log"`,
  `snapshot --in .bubble-task`. Shows the heading "Thoughts", the toggle pressed, and "+ Add a
  thought" last.
- **`th-add`.** Add Alpha and Beta with Enter, Gamma with Shift+Enter, then Delta. By hand:
  `click --role button --name "+ Add a thought"`, `fill "Alpha thought" --placeholder "What's on your mind? Press Enter to add…"`,
  `press Enter`, `rows thoughts --select text,group_id`. Shows the four in order in Libre
  Baskerville, stored with no group.
- **`th-hover`.** Rest the pointer on the heading, then on Alpha's row. Shows its checkbox and
  "Add a title…" (title "Click to edit title") at opacity 0, then 1 and about 0.6.
- **`th-title`.** Click the title: Morning and Enter; empty and Enter; Evening and Shift+Enter.
  Shows each stored, the empty one cleared.
- **`th-edit-body`.** Click Beta's text, Shift+Enter and "second line", Enter; open and commit it
  unchanged; set it back. Shows the field holding the line break, the text stored with it, and
  no write for the unchanged commit.
- **`th-edit-fails`.** Drop thought edits, change Gamma, Enter. Journey only. Shows the note
  and the field open again, not focused, with the words (`…-reopened.png`).
- **`th-delete`.** Add Short-lived, × "Delete thought". Shows it gone and the four stored.
- **`th-group`.** Select Alpha and Beta, Group, name "Morning pages", Enter. By hand:
  `check --role checkbox --name "Select thought" --nth 0`, `check … --nth 1`,
  `click --in .th-action-bar --role button --name Group --exact`. Shows "2 selected" with Group
  and ×, no De-group; the name field focused; a dashed group "2 thoughts Morning pages" in their
  place; both stored in it.
- **`th-untitled`.** Group Gamma and Delta and press Escape in the name field. Shows "Untitled
  group", which is also the stored name.
- **`th-select-all`.** Select Alpha alone, then the group's checkbox. Shows the checkbox mixed
  (`…-mixed.png`), then checked with "2 selected".
- **`th-same-group`.** Group with exactly that group selected. Shows the bar closing and no
  write.
- **`th-merge`.** Add Epsilon; select the group whole and Epsilon. Shows "3 selected" and Merge;
  after it, Morning pages holds Alpha, Beta, Epsilon, stored.
- **`th-degroup`.** Select Beta and Alpha, De-group (title "Remove the selected thoughts from
  their group"). Shows them at the bottom, Alpha first, and Morning pages left with Epsilon.
- **`th-pop-out`.** "Pop thought out of group" on Epsilon. Shows Morning pages gone, Epsilon at
  the bottom, one group stored.
- **`th-ungroup`.** Ungroup the untitled group. Shows Gamma and Delta at the end in creation
  order and no group stored.
- **`th-reorder`.** Group Gamma and Delta as "Later"; drag Epsilon to the top, the group to the
  top, Delta above Gamma inside it; reload. By hand:
  `drag --in .bubble-task --css "li.th-row .th-handle" --nth 2 --to-css "ul.th-feed > li" --to-nth 0 --position top`.
  Shows each order, kept after the reload.
- **`th-into-group`.** Drag Beta onto Later's header. Shows "3 thoughts" with Beta in it, stored
  as the group's last member.
- **`th-clear`.** Select two, then the bar's ×. Shows the bar gone and nothing checked.
- **`th-edge-scroll`.** Add 18 thoughts, drag Epsilon to the feed's bottom edge and rest there,
  move to the middle and rest, press Escape, rest, let go. Journey only. Shows the feed
  scrolled and then still (the note gives where), and the feed unchanged after the release —
  the same drag without Escape does move it, so the check can fail.

## Gotchas

- A thought's text element is replaced by a field while it is edited: find the field in the
  panel (`textarea.th-text-input`), not inside the row found by its text.
- After Group, Merge, De-group, pop-out and Ungroup the feed is renumbered; after a delete or a
  drop onto a group it is not, so a new group member may show first until the next load.
- The bar's clear button is named "×" only; scope it with `--in .th-action-bar`.
- Drags rest with `holdDrag` (a one-pixel jitter); a feed full enough to scroll needs about 18
  more thoughts at the journey's window size.
