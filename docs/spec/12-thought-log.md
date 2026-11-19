## §12 Thought log

Code: `src/dashboard/ThoughtLog.tsx`, `src/lib/transforms.ts`, `src/dashboard/useEdgeAutoScroll.ts` · Keeps: I3, I13

The Daily Task panel's second view (`src/dashboard/ThoughtLog.tsx`), titled "Thoughts": a
project-scoped, free-form feed for thinking on the page. The feed math is pure and lives in
`src/lib/transforms.ts` (`computeGroup`, `computeUngroup`, `computeMerge`, `computePop`); the
seam runs it on a freshly fetched feed and persists only the difference.

**The feed.** Top-level items are loose thoughts and groups sharing one order; thoughts
inside a group have their own order. Thought text and titles use the thought font
(`DESIGN-SYSTEM.md`).

- "+ Add a thought" is always the last row; its field reads "What's on your mind? Press Enter
  to add…" and Enter (Shift+Enter included) adds a loose thought whose order number is the
  count of loose thoughts plus groups, waiting for its save (§7). Thought text stops at
  4,000 characters, here and in the edit field; a title or a group's name at 200.
- Each thought: a checkbox revealed on hover ("Select thought"), a drag grip, an optional
  title (click to add or edit, "Click to edit title", placeholder "Add a title…", hidden
  until the row is hovered, then shown faintly; empty clears it; Enter commits, Shift+Enter included), the body
  (click to edit; Enter commits, Shift+Enter inserts a newline; empty or unchanged text
  writes nothing; when the save fails, the field reopens with the words typed, without
  taking the cursor), and × ("Delete thought"). Grouped thoughts also show a pop-out button
  ("Pop thought out of group").
- A drag by the grip reorders thoughts and whole groups in the feed, and thoughts within a
  group; dragging a loose thought onto a group header moves it into that group — persisted
  with the group's member count as its number, which is the last place unless a member was
  deleted or popped, since members keep their numbers then, so the dropped thought can tie
  with the last member, and after a reload the database's order of the two decides which
  shows first; and until the next load the screen keeps the thought's old order number, so
  it may show first inside the group.
- While a drag of a loose thought, a group or a thought inside a group is held within 56 px
  of the feed's top or bottom edge, or anywhere above or below the feed, the feed scrolls
  14 px per animation frame in that direction, and stops at either end. Moving the pointer
  back towards the middle, or off to either side of the feed, stops it, and so do a drop and
  Escape; a drag cancelled with Escape leaves the feed where it scrolled to and the item in
  its old place. A feed short enough to fit does not move.

**Selecting and grouping.** Ticking checkboxes builds a selection; a group header's checkbox
("Select all thoughts in this group") selects all its members and shows indeterminate when
only some are selected. With two or more thoughts selected an action bar appears: "{n}
selected", then "De-group" ("Remove the selected thoughts from their group") when any
selected thought is grouped, then "Group" or "Merge", then × to clear.

- **Group** makes a new group from the selected thoughts, placed by the highest raw order
  number among them: the feed position of the latest-sorted one when all are loose; when the
  selection includes a grouped thought, its number inside its group is compared with the
  feed's numbers, so the group can land elsewhere than any selected thought. Members are
  ordered by their raw order numbers, which compare a group
  member's position inside its group with a loose thought's position in the feed, so a
  selection that mixes both levels can reverse their visible order. The rename field opens at once
  ("Name this group…"), and a group dismissed without a name is called "Untitled group".
  Selected thoughts leave any old group, and an emptied group disappears. When the whole
  selection is already one group and nothing else, the button still reads "Group"; pressing it
  writes nothing but clears the selection, so the action bar closes.
- **Merge** replaces Group when a whole group is selected together with something outside it:
  everything moves into that group (the earliest in the feed if several), newcomers appended
  oldest-first, and the group keeps its name.
- **De-group** pops only the selected grouped thoughts back to the feed. Each takes, as a
  sort key only, the count of loose thoughts plus groups, oldest-first, and the feed is then
  renumbered gap-free from those keys, a thought sorting before a group with the same key; so
  the popped thoughts land at the bottom unless a gap, left by a deletion or by a drag into
  a group, puts a key at or below a later item's, when they land above it. The group
  survives if members remain. The per-row pop-out does the same for one thought.
- A group header carries the select-all checkbox, a grip, "{n} thought(s)", the name (click
  to rename; an empty name changes nothing) and "Ungroup", which dissolves the group and
  returns its thoughts to the end of the feed in creation order.

Groups draw as a dashed box. Group, Merge, De-group, pop-out and Ungroup renumber the feed
gap-free; deleting a thought and dragging one into a group do not, and adding a thought
assigns a count-based number, so after those operations the order can hold gaps or a tie
between a thought and a group (ties render the thought first) until the next renumbering
operation. The renumbering is a sequence of client writes, not one transaction: a failure
part-way (a lost connection mid-group) can leave an emptied group or a gap in the order until
the next operation renumbers again.
