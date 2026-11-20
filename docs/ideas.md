# Ideas

Things worth building that are not built yet. They are in no particular order and are not a
plan: the owner picks one, and the pull request that builds it removes its entry. To add an
idea, write it here in a few lines. What Compass does today is in `docs/spec/` and
`DESIGN-SYSTEM.md`, never here.

## Product

- **Open the companion from the menu bar, and remember where it was put.** The companion
  (spec §23) opens from the sidebar alone, at the place and size the system gives it each
  time. A line in the menu bar's menu could open it without the main window, and its place
  on the screen could be kept between openings.
- **An installer for the desktop app.** The desktop app runs from the source (spec §22).
  Package it so a person can download and open it, and so Open at Login can be pressed.
- **Start and stop the clock from the menu bar.** The menu bar shows the running clock (spec
  §22) and cannot change it.
- **Export and import of the data kept on this device.** A copy with no accounts keeps its
  data in one browser's storage, or in the desktop app's file (spec §3, §22), with no way in
  the app to take it out or bring it in.
- **Self-serve data export and account deletion.** The privacy notice says the beta offers
  neither (spec §14). Deleting an account needs a server-side piece, because it takes
  Supabase's service key, which never reaches the browser (I2).
- **Design-system overhaul.** Turn the literal sizes, radii, spacings, shadows and transitions
  into tokens, and revisit the color system. DS §10 lists the debt.
- **A confirmation link waits for a person.** Mail scanners open links before people do. The
  reset link already waits for the person to press Continue (spec §5); the sign-up
  confirmation link does not, so a scanner can confirm an account. Make it wait the same way.
- **Planned versus actual.** The setup asks how many days the project will take and how many
  hours a day the user actually has, and stores both (`projects.total_days`,
  `hours_available_per_day`). Nothing reads them back. Show each beside what the user logs:
  days so far against the days planned, and hours logged against the hours available. The two
  columns stay in the schema for this (I16).
- **A task linked to a phase or a learning item.** Let a task name the phase or the learning
  item it serves, so the work behind each can be seen together. The columns are there
  (`daily_tasks.phase_id`, `learning_item_id`), the app leaves them empty today, and they stay
  for this (I16).

## Fixes

- **The thought feed keeps its order.** Deleting a thought, or dragging one into a group, does
  not renumber the feed, so a thought added afterwards can tie with a group and show above it
  instead of at the bottom. A thought dragged into a group also shows in its old place until
  the next load (spec §12).
- **A new group's id on an old browser.** The seam makes a thought group's id with the
  browser's `crypto.randomUUID` and falls back to a string that is not a UUID where that is
  missing (iOS before 15.4), which the `uuid` column refuses, so grouping thoughts fails
  there. The setup already makes its id without `randomUUID` (`randomId` in
  `src/lib/transforms.ts`, spec §21); use it for groups too.
- **Keyboard and cancel in the shell.** The upper cards toggle by mouse only; they need to work
  from the keyboard. Flipping between Projects and Archive saves a half-finished rename
  instead of cancelling it; today only Escape cancels (spec §6).

## Testing and tooling

- **Test coverage gaps.** Screens and flows that no test renders: sign-in, password recovery
  and the screen gate; the time display and interview editing; project selection, ordering
  and archive restore; daily tasks and thought editing; timeline pacing and the learning card;
  the dashboard shell, Settings and the landing page.
- **A deploy waits for a green check.** On GitHub's free plan a red check cannot block a
  merge, and Vercel deploys `main` as soon as it is pushed. Either move to GitHub Pro and
  protect `main` (a pull request and a green check required), or turn off Vercel's automatic
  deploy and let CI deploy once the checks pass.
- **One reading of imports.** Two checks in the suite read the app's imports, the hosting-build
  check and the seam check (I1), each in its own way, and they already disagree. Give them one
  shared reader.
- **The database checks on the owner's Mac.** GitHub minutes run past the free 2,000 a month,
  mostly on the database checks, and each push waits about 22 minutes for them. Run them on
  the owner's Mac in a walled-off Linux machine instead, and skip the test tools' own
  self-tests when only app code or documents change.
