# Projects, sidebar and archive

Every live project is a pill in the sidebar: click to switch, rename the active one in place,
drag to reorder, × to delete through one small confirmation, and archive a finished one. The
header flips to the Archive view, and with every project archived the setup's "View archive (N)"
opens the standalone archive screen (spec §6).

## Sub-features

- `sb-pills` the header, one pill per live project in order with its accent dot, the active pill, "+ New project" last.
- `sb-switch` a pill switches the project: the cards reload, the sidebar stays.
- `sb-rename` the active pill renames in place: Enter, Escape, empty → "My project", 200 characters.
- `sb-reorder` pills drag to a new order that persists.
- `sb-delete-confirm` the × and the delete confirmation: focus, Tab, Escape, Cancel, a press outside.
- `sb-delete` Delete removes the project and its rows; the next live project opens.
- `sb-finished-archive` the archive icon on a finished project, and archiving it.
- `sb-archive-view` the Archive view: order, "archived {Mon d}", restore to the end of the live list.
- `sb-archive-delete` deleting from the Archive view, and its empty line.
- `sb-rename-flip` flipping the view while renaming commits the draft.
- `sb-one-panel` the delete confirmation closes an open Settings panel.
- `archive-screen` the standalone archive screen: list, Restore, ×, deleting the last.
- `sb-archive-screen-empty` not driven: the archive screen's "Nothing archived yet." needs the archive to empty between the setup's link and the screen; no user path gets there.

## How to get to it (user POV)

- The sidebar of any dashboard: its pills, the header button "Projects ⇄" / "Archive ⇄", and
  "+ New project".
- Hovering a pill, or tabbing onto it, shows its ×; a finished project's pill shows its archive
  icon at rest.
- With every project archived, the setup's "View archive (N)" (top right).

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey signs in its own account and sets up Alpha and Beta, later Gamma
  and Delta.

Run the whole recipe: `node scripts/verify/verify.mjs journey sidebar`.

- **`sb-pills`.** Set up two projects. By hand: `account`, `sign-in`, `setup --name Alpha`,
  `setup --name Beta`, `snapshot --in aside.sidebar`. Shows "Projects ⇄" titled "Show the
  archive", pills Alpha then Beta, Beta active, each dot in the stored `accent_color`, "+ New
  project" last.
- **`sb-switch`.** Click Alpha (title "Switch to Alpha") while its phases read is held. By hand:
  `click --css ".project-pill" --nth 0`. Shows `main.dashboard` reading "Loading…" with the
  pills still there (`…-loading.png`), then Alpha's Timeline hero "Sketch the screens".
- **`sb-rename`.** Click the active name (title "Click to rename"), type, Enter; Escape; empty;
  250 characters. By hand: `click --css ".project-pill.active .pill-name"`,
  `fill "New name" --css "input.pill-rename"`, `press Enter`, `rows projects --select name`.
  Shows the name stored, Escape keeping the old, "My project" for an empty name, and the field
  holding 200 characters.
- **`sb-reorder`.** Drag Beta's pill (pressed on its dot side) onto Alpha's top, reload. By hand:
  `drag --css ".project-pill" --nth 1 --to-css ".project-pill" --to-nth 0 --position top`.
  Shows Beta, Alpha on screen, after the reload, and in `sort_order`.
- **`sb-delete-confirm`.** Hover Beta, Tab onto its ×, open, Tab around, Escape, Cancel, press
  outside. By hand: `hover --css ".project-pill" --nth 1`,
  `click --role button --name "Delete Beta" --exact`, `focused`, `press Tab`, `press Escape`.
  Shows × at opacity 0, above 0 on hover, 1 on keyboard focus; the dialog `Delete "Beta"?`
  described by "This removes its phases, tasks, learning, thoughts and time history.", the page
  behind it `aria-hidden` (`…-open.aria.yml` shows the dialog alone), focus on Cancel then round
  its two buttons, and focus back on × after Escape or Cancel; Beta still stored.
- **`sb-delete`.** Make Beta active, × then Delete. Shows Beta gone, Alpha active, and no Beta
  project, phase or learning item stored.
- **`sb-finished-archive`.** Set up Gamma and Delta, open Alpha, tick every phase, archive. By
  hand: `click --role button --name "Archive Alpha" --exact`. Shows no archive icon before the
  last tick and "Archive (finished) — move to the archive" after it, without a reload; Alpha
  leaves the pills, Gamma opens, Alpha stored with `archived_at`.
- **`sb-archive-view`.** Archive Gamma too, flip to the Archive view, restore Alpha. By hand:
  `click --css "aside.sidebar .sidebar-toggle"`, `click --role button --name "Restore Alpha" --exact`.
  Shows "Archive ⇄" titled "Back to your projects", Gamma above Alpha, "archived {Mon d}" with
  today's date, then Alpha last in the live list and active, stored with no `archived_at`.
- **`sb-archive-delete`.** In the Archive view, × "Delete permanently" on Gamma, Delete. Shows
  "Nothing archived yet. Finish a project and you can tuck it away here."; Gamma no longer
  stored.
- **`sb-rename-flip`.** Open the active pill's rename, type, flip the view and back. Shows the
  draft kept on the pill and stored.
- **`sb-one-panel`.** Open Settings, then a pill's ×. Shows the confirmation open and the
  Settings dialog closed.
- **`archive-screen`.** Archive every live project: the setup shows no ← Back and "View archive
  (2)"; open it, delete one, restore the other, archive it again, delete it from "View archive
  (1)". Shows the title "Archive", the line "Projects you've finished and tucked away. Restore
  one to pick it back up, or remove it for good.", ← Back, rows with "archived {Mon d}"
  (`…-two-archived.png`), Restore opening the project, and the last delete returning to the
  setup with no archive link and no project stored.

## Gotchas

- `.project-pills .project-pill` also matches the archived rows in the Archive view; the
  journeys pick a live pill by its whole name (`projectPill` in `screens.mjs`), since "Hours"
  is part of "Other hours".
- After an archive or a delete, the next project's cards load a moment later: tick phases only
  once its "0/N done" shows (`tickEveryPhase` waits for it).
- A press "outside" the confirmation must land on something inert: the sidebar's empty space.
  On a bubble it would also flip the dashboard view.
- The pill's × is always in the page and only fades in; check its opacity, not its visibility.
