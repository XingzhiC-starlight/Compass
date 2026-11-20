## §10 Learning card

Code: `src/dashboard/LearningCard.tsx`, `src/dashboard/learningFocus.ts`, `src/dashboard/CSlider.tsx`, `src/dashboard/projectTime.ts` · Keeps: I11, I13, I14, I15

The upper-right bubble (`src/dashboard/LearningCard.tsx`, with the pure
`src/dashboard/learningFocus.ts`), titled "Learning". It is navigational, not numerical: the
percentages are self-rated and may go down (principle 6).

**Glance.** Eyebrow "{pct}% · Focus" — the focus item's own progress — or "No focus set"
when there are no items. Hero: the focus item's name, click-to-rename in place; "Add
something to learn" when there are no items. Should no item carry the flag while items exist
— possible when the second of the two focus writes (clear, then set) fails — the glance shows
the first row. The bar is a slider (`CSlider`, I15): drag anywhere on the track to set the
focus item's progress without leaving summary view; with the keyboard, ←/↓ and →/↑ move by 5,
Home and End go to 0 and 100. With no items a static empty bar takes its place.

**Depth: the roadmap.** Column head "Skill" / "Progress". Rows render in the user's order and
only a drag by the grip changes it; nothing auto-sorts, because rows that float on focus or
completion fought the user's own ordering. Each row: grip, a completion circle, the name, a
small "focus" tag on the focus item, ×, and the percent. In a card too narrow to leave the
name about six characters beside it, the "focus" tag is not shown; the glance above still
names the focus (DS §6.1).

- The circle is a completion toggle ("Mark learning item done" / "Mark learning item not
  done"). Done means progress ≥ 100 and shows as a filled circle with a check and a muted
  struck-through name. Marking done sets 100 and remembers the previous value for as
  long as the card stays mounted; unmarking restores it, or 0 after a project switch or reload
  (I11).
- Percent: "60%" at rest ("Click to edit progress"), a 0–100 number input while editing
  (I14); an unchanged or empty entry writes nothing, and Escape cancels.
- "+ Add something to learn" opens an input ("Name a skill, press Enter…") that stays open
  after each Enter, each waiting for its save (§7); a new item starts at 0% and goes last.
  × deletes ("Delete item"). Names stop at 200 characters, here, in the roadmap's rename and
  on the glance.

**Focus rules.** There is no direct "make this the focus" control. At most one item carries
the flag (§3), and it moves implicitly:

- After any drag-reorder, the first open row (progress below 100) in the new order becomes the
  focus if it is not already, whether or not it was the row dragged; completed rows above it
  are passed over. With every row complete, a drag leaves the focus where it was.
- Completing the focus item advances focus to the next open item (progress below 100),
  scanning forward and wrapping to the start. Dropping an item back below 100 sends focus to
  the first open item in list order.
- A newly added item becomes the focus only when no open focus exists — an empty roadmap, or
  a focus that is already complete.
- Deleting the focus item hands focus to the first open row that remains, and to the first
  remaining row only when every remaining row is complete; deleting the last item leaves none.

The rules for a drag, an added item and a deletion are the pure functions of
`src/dashboard/learningFocus.ts`; the rule for completing or reopening an item is the card's
own. Focus writes and deletions run through a queue in the seam, so rapid clicks land in the
order they were made.
