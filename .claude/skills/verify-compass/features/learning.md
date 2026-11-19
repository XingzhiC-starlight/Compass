# Learning card

The upper-right bubble shows the focus item: its self-rated progress on a slider that drags and
takes the keyboard, its name editable in place; in depth, the roadmap in the user's own order,
each item completed, edited, added, deleted or dragged. At most one item is the focus, and it
moves by rules rather than a control (spec §10).

## Sub-features

- `lr-glance` "10% · Focus", the focus item as the hero, the slider named and valued.
- `lr-slider-drag` a drag along the slider sets progress, and its release never flips the view.
- `lr-slider-keys` arrows by 5, Home 0, End 100; End completes the focus, which moves on.
- `lr-glance-rename` the hero renames the focus item.
- `lr-depth` the roadmap's head and each row's grip, circle, name, "focus", × and percent.
- `lr-add` "+ Add something to learn" stays open; new items start at 0% and go last; the open focus stays.
- `lr-complete` completing the focus moves it on; unmarking restores the old value and the first open item becomes the focus.
- `lr-percent` the percent edits as 0–100; empty and Escape write nothing.
- `lr-reorder` rows drag by the grip; afterwards the first open row is the focus.
- `lr-unmark-after-reload` the remembered value is lost on a reload: unmarking then gives 0%.
- `lr-new-focus` with every item complete, a new item becomes the focus.
- `lr-delete` deleting the focus hands it on; deleting the last item leaves "No focus set".

## How to get to it (user POV)

- The Learning bubble of any dashboard: the hero is click-to-rename, the slider drags or takes
  the arrow keys.
- Depth shows "Skill" / "Progress", the rows and "+ Add something to learn".

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up "Skills" with Layout basics (10%, the focus) and Colour
  (30%).

Run the whole recipe: `node scripts/verify/verify.mjs journey learning`.

- **`lr-glance`.** Set up Skills. By hand: `snapshot --in .bubble-learning`. Shows "10% ·
  Focus", "Layout basics", and `slider "Progress for Layout basics"` at 10.
- **`lr-slider-drag`.** Press the slider at 30% of its width, drag to 60%, drift off the track
  onto the card and let go. Journey only (it needs a held press). Shows the value 60, "60% ·
  Focus", the view still summary, and 60 stored.
- **`lr-slider-keys`.** Focus the slider; →, ↑, ←, ↓, Home, then End. By hand:
  `click --role slider` sets a value first; then `press ArrowRight --role slider`. Shows 65, 70,
  65, 60, 0 ("0% · Focus"), then Colour as the focus at "30% · Focus" and Layout basics at 100.
- **`lr-glance-rename`.** Click the hero, type "Colour theory", Enter. Shows it stored.
- **`lr-depth`.** Depth. Shows "Skill Progress", Layout basics done (pressed, struck through,
  100%), Colour theory open with its grip, "Mark learning item done", "Delete item", "30%"
  titled "Click to edit progress", and the only "focus" tag.
- **`lr-add`.** "+ Add something to learn": Typography, Enter, Spacing, Enter, Escape. By hand:
  `click --role button --name "+ Add something to learn"`, `fill Typography --placeholder "Name a skill, press Enter…"`,
  `press Enter`. Shows both last at 0%, the box focused between, the focus still Colour theory.
- **`lr-complete`.** Mark Colour theory done, then not done. Shows 100% and the focus on
  Typography, then 30% again and the focus back on Colour theory.
- **`lr-percent`.** Typography's "0%": 45 and Enter, then empty and Enter, then 90 and Escape.
  By hand: `click --in .bubble-learning --title "Click to edit progress" --nth 2`,
  `fill 45 --role spinbutton`, `press Enter`. Shows 45% stored, unchanged by the other two.
- **`lr-reorder`.** Drag Spacing by its grip to the top, then Layout basics. Shows Spacing as the
  focus after the first drag and still after the second (Layout basics is done and passed
  over); the order stored.
- **`lr-unmark-after-reload`.** Mark Typography done, reload, unmark it. Shows 0%, not the 45%
  it had.
- **`lr-new-focus`.** Mark every item done, add "Fresh start". Shows it as the focus, "0% ·
  Focus".
- **`lr-delete`.** Delete Fresh start, then every item. Shows the focus on Layout basics (every
  remaining item is complete), then "No focus set", "Add something to learn", no slider and an
  empty bar, and nothing stored.

## Gotchas

- Clicking the slider sets its value where it is clicked; to move it by the keyboard alone,
  focus it without a click (the journey uses the slider's focus).
- The value an item had before completion lives only while the card is mounted: a reload or a
  project switch forgets it.
- Focus writes and deletions are queued in the seam; read the stored focus with a poll, not
  once right after a click.
