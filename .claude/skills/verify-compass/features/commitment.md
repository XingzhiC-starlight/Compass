# Commitment card

The upper-left bubble logs time: today's hours over the daily goal, both editable in place, a
round button that starts and stops the work session, a bar and a sparkline; in depth, the
history by days or weeks with past days editable. The day rolls at local midnight, and a clock
left running is capped at its day's end (spec §8).

## Sub-features

- `tm-glance` the eyebrow, the hero, the empty bar, the clock off.
- `tm-edit-goal` the goal edits in place and is stored; refused and cancelled entries write nothing.
- `tm-edit-logged` today's hours are replaced by one session; dismissing the editor writes nothing.
- `tm-clock` the work session starts, ticks and stops, re-synced from what is stored.
- `tm-edit-while-running` editing today's hours with the clock running keeps it running from the new total.
- `tm-one-clock` one clock app-wide: starting in another project closes the running one.
- `tm-refused-start` a start whose session cannot be written leaves the clock off, with one note.
- `tm-bar-sparkline` the bar capped at 100%, one sparkline bar per day, today marked.
- `tm-depth-days` the days history, read-only today, the footer.
- `tm-depth-weeks` the weeks history, read-only, the footer.
- `tm-past-days` a three-day-old project's past days, edited in place and stored for that day.
- `tm-day-rollover` midnight with the tab open: the clock stops, the session closes at midnight, today restarts at 0.
- `tm-midnight-cap` a session left running overnight with no tab open is capped at its day's midnight.

## How to get to it (user POV)

- The Commitment bubble of any project's dashboard; the halves of its hero "X/Yh" are
  click-to-edit, the round button left of them starts and stops the session.
- Depth (a click on an upper bubble's empty space) shows "Days ⇄" / "Weeks ⇄" and the rows.

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up "Hours" (goal 2h, phases of 4 and 6 days), later
  "Other hours", and with the page clock set back: "Three days old", "Midnight", "Left open".

Run the whole recipe: `node scripts/verify/verify.mjs journey commitment`.

- **`tm-glance`.** Set up Hours. By hand: `setup --name Hours`, `text --in .bubble-time --css .glance-eyebrow`,
  `text --in .bubble-time --css .glance-hero`. Shows "Day 1 / 10 · Goal 2h" (rendered
  uppercase), "0/2h", a bar at 0% and "Start work session".
- **`tm-edit-goal`.** Click "2h", type 3, Enter; then "2h", "1,5", "-1" and an Escape. By hand:
  `click --in .bubble-time --css ".glance-hero > span" --nth 1`,
  `fill 3 --css input.glance-hero-input`, `press Enter`, `rows projects --select hours_planned_per_day`.
  Shows "0/3h", "Goal 3h", 3 stored, and no write for the rest.
- **`tm-edit-logged`.** Click "0", type " .5 ", then "1.5"; open and dismiss with Escape and
  with a blur. Shows "0.5/3h", then "1.5/3h", the bar at 50%, one session of 5,400 s stored for
  today, and no write from the dismissals.
- **`tm-clock`.** Set today to 0.049 h (176 s), start, wait, stop. By hand:
  `click --in .bubble-time --role button --name "Start work session"`, `rows time_sessions --select started_at,ended_at,duration_seconds`.
  Shows "Stop work session" and one open session; the hero turns from "0/3h" to "0.1/3h" as the
  clock passes 180 s; after the stop no open session and a stored total of at least 180 s.
- **`tm-edit-while-running`.** Start the clock, set today to 2, stop. Shows "2/3h" with the
  clock still running and one open session, then after the stop "2/3h" and a stored total of
  2 h plus the seconds since.
- **`tm-one-clock`.** Start Hours, set up Other hours and start it there. Shows Hours' session
  closed and Other hours' the only open one; Hours shows "Start work session" when opened again.
- **`tm-refused-start`.** Drop the session's insert and press Start. Journey only. Shows one
  note, the clock still off (`…-refused.png`), no open session stored, and "2/3h" kept.
- **`tm-bar-sparkline`.** Set today to 5 h against 3 h. Shows "5/3h", the bar at 100%, and one
  sparkline bar marked `today`.
- **`tm-depth-days`.** Depth. By hand: `snapshot --in .bubble-time`. Shows "Days ⇄" titled
  "Switch between day and week history", "/ 3h", one row "Today 5h" with no editable hours,
  "1-day total 5h" and "avg 5h/day".
- **`tm-depth-weeks`.** "Days ⇄". Shows "Weeks ⇄", "/ 21h", "This week 5h", "1-week total 5h",
  "avg 5h/wk".
- **`tm-past-days`.** Set up "Three days old" in a visit with the page clock three days back,
  then open it in a visit of today. Journey only. Shows "Day 4 / 10", rows Day 1, Day 2, Day 3,
  Today with three "Click to edit hours"; Day 2 set to 2 shows "2h", "4-day total 2h",
  "avg 0.5h/day", and 7,200 s stored on that day; opening and blurring Day 3 writes nothing.
- **`tm-day-rollover`.** In a visit at 23:58:30 yesterday, set up "Midnight", log 1 h, start the
  clock, run the page clock 150 s past midnight. Journey only. Shows the clock off, "0/2h",
  "Day 2 / 10"; the running session stored as closed at that midnight, every session on
  yesterday's day; depth rows "Day 1 1h" and "Today 0h".
- **`tm-midnight-cap`.** In a visit at 23:59 yesterday, set up "Left open" and start the clock;
  sign in on a visit of today. Journey only. Shows "Left open" with the clock off and "Day 2 /
  10", and its session stored as closed at its day's midnight.

## Gotchas

- Hours show in tenths: a running clock moves the hero only every six minutes, so the clock step
  sets 176 s first and watches it pass 180 s.
- The page clock covers the whole browser context. A "next morning" is a new visit (new context,
  signed in again), never a new tab in the clocked one.
- Keep fake times in the past: in the future the page would think its sign-in had expired.
- The day keys are the machine's local day; the run reads the same local time zone as the
  page, so a run across real midnight can read Day n off by one.
