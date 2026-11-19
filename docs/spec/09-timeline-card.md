## §9 Timeline card

Code: `src/dashboard/TimelineCard.tsx` · Keeps: I13, I14

The upper-middle bubble (`src/dashboard/TimelineCard.tsx`), titled "Timeline".

**Glance.** Eyebrow "Phase n of N" ("No phases yet" with none). Hero: the current phase's
name — the first phase not ticked done — click-to-rename in place (an empty name keeps the
old one); "All phases done" when every phase is done; "—" with no phases. The bar fills with
calendar progress through the current phase: whole days elapsed since the project's start
day, minus the estimated days of all preceding phases, divided by the current phase's
estimate, clamped to 0–100; 100 once all phases are done; 0 when the phase has no estimate.
Two notions of "phase start" coexist on the dashboard on purpose: this bar uses the *planned*
start (project start plus the preceding estimates), while the Commitment eyebrow's Day n uses
the *actual* start (the latest completion day). The gap between where the calendar says you
should be and where you are is the point. The card re-renders once a minute so the bar
advances at midnight without any activity.

**Depth: the phase checklist.** Column head "Phases" and "{done}/{total} done". Each row,
left to right: a drag grip, a state circle, the name — with a "now" tag on the current phase,
whose row is washed in the timeline accent — a delete ×, and the day count.

- The circle is a done toggle ("Mark phase done" / "Mark phase not done"). Ticking stamps
  `completed_at` with today's local day and the row turns done (filled circle with a check,
  muted struck-through name); the Commitment card's Day count resets to 1 at once. Unticking
  clears the date.
- Name: click-to-rename ("Click to rename"); empty keeps the old name; 200 characters at
  most, here and on the glance (§7).
- Days: "9d" at rest ("Click to edit days"), a number input while editing (I14); whole,
  non-negative.
- "+ Add a phase" opens an input ("Name a phase, press Enter…") that stays open after each
  Enter so several phases can be typed in a row, each waiting for its save (§7); a new phase
  gets one estimated day and goes last.
- × deletes ("Delete phase"). Rows drag-reorder by the grip; the order persists.
- All done: no "now" tag, hero "All phases done", eyebrow "Phase N of N", bar full.
