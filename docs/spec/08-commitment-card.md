## §8 Commitment card

Code: `src/dashboard/TimeCard.tsx`, `src/dashboard/hoursEdit.ts`, `src/dashboard/projectTime.ts` · Keeps: I3, I4, I14

The upper-left bubble (`src/dashboard/TimeCard.tsx`), titled "Commitment", is the daily
on-ramp: logging hours and starting the work session are the same action.

**Glance.**

- Eyebrow "Day n / N · Goal Xh" (rendered uppercase). n counts days since the current phase
  start — the latest completion day among done phases, else the project's start day — so it
  resets to Day 1 the day a phase is ticked done. N is the sum of estimated days over
  unfinished phases and is omitted when it is zero. X is the daily goal. When every phase is
  done the eyebrow reads "Done · Goal Xh".
- Hero "X/Yh": today's logged hours over the daily goal, e.g. "2.5/4h". Both halves are
  click-to-edit in place (I14). The left replaces today's sessions for the project with one
  synthetic session holding the entered total, stamped with the current time (the original
  session breakdown is not kept): the new session is written first and the day's earlier
  sessions are removed second, two requests without a transaction, so a failure between them
  leaves the day reading its earlier hours plus the entered ones until the next edit of that
  day, never nothing. Edits of a day's hours are sent one at a time, so two quick edits end
  with the later value. The right writes the project's daily goal. Enter or blur commits, Escape cancels; an unchanged
  text, a non-number or a negative value writes nothing, so opening and dismissing the editor
  never overwrites the exact seconds with the rounded display. A number is a plain decimal
  such as "2", "2.5" or ".5", with any spaces around it ignored; "2h" or "1,5" is not one and
  writes nothing. Editing logged hours while the clock runs re-opens a fresh running session
  from the new total, or shows the clock off when the seam could not start one.
- The round button at the head of the hero starts a session ("Start work session") or stops
  it ("Stop work session"). While running the on-screen total ticks up once per second, and
  stopping re-syncs the exact total from the seam. Starting closes any running session in
  any of the user's projects before inserting the new one, so that at most one clock runs
  app-wide (I3), each closed session credited only up to the earlier of now and its own day's
  midnight. Every close is checked: when one fails, or the new session cannot be written,
  nothing is started, the failed-save note shows once, and the card turns its clock off and
  re-syncs (§2); a clock that could not be closed is then the only one running. Only the
  active project's card is mounted, so a project
  whose clock was stopped this way shows it stopped when next opened. Stopping closes the
  project's running session — every one, should an older start have left two — at the
  earlier of now and its day's midnight, so a stop after midnight credits the old day only
  up to midnight.
- A thin bar fills with today's logged ÷ goal, capped at 100%. Beside it a sparkline mirrors
  the depth view — one bar per day (up to 7) or per week (up to 7), scaled to the larger of
  the goal and the values shown.
- Hours print in tenths with the trailing zero dropped: "4", "2.5".

**Day boundary.** Once a minute the card compares the local day (I4) with the day it is
showing. When the day rolls — at midnight with the tab open, or on waking after a sleep of
any length — a running clock stops and its session is closed at its day's midnight, the
49-day history is re-read (§7) so every day that passed has its own row with its stored hours,
and today restarts at 0 with the clock off. The clock never restarts itself. Two cases at
midnight: with the tab open, the on-screen total keeps ticking until the once-a-minute check
notices the new day, at most a minute, and those seconds are not credited; with the tab
closed, a session left open across midnight is capped at its own day's local midnight the
next time any time data is read, and whenever it is shown before that it counts only up to
its day's end. A session never runs forever.

**Depth: Days ⇄ Weeks.** A header button switches the history ("Switch between day and week
history"); the right side shows "/ Xh" — the daily goal in days, the goal × 7 in weeks. The
source is the 49-day series loaded with the project (§7).

- Days: the last seven days that exist for the project ("Day n" … "Today"; a young project
  shows fewer rows). Past days are click-to-edit ("Click to edit hours") under the same rule
  as the glance hero: an unchanged text, a non-number or a negative value writes nothing, so
  opening and blurring a past day keeps its exact seconds. Today is read-only here because it
  mirrors the live clock and is edited from the glance.
- Weeks: seven rolling seven-day buckets ending today ("Week n" … "This week"), read-only —
  an aggregate has no single day to write back to.
- Footer: "{n}-day total Xh" and "avg Yh/day" (or "-week" and "/wk"). The average divides by
  the rows shown, zero-hour days included; the only rows excluded are those before the
  project's first day.
