## §6 Projects, sidebar and archive

Code: `src/dashboard/Sidebar.tsx`, `src/archive/ArchiveScreen.tsx`, `src/dashboard/DeleteConfirm.tsx`, `src/dashboard/useDeleteConfirm.tsx` · Keeps: I3, I9

Every dashboard has a sidebar (`src/dashboard/Sidebar.tsx`) with two views, Projects and
Archive, flipped by the single header button that shows the current view's name with a ⇄
glyph (tooltips "Show the archive" / "Back to your projects"). Flipping while a rename is in
progress commits the draft, because the input's blur fires before the view changes; Escape is
the cancel.

**Projects view — one pill per live project**, in `sort_order`, each with a dot in the
project's accent color.

- Clicking a pill switches to that project (tooltip "Switch to {name}"); the sidebar stays
  put and only the cards reload (§7).
- The active pill's name is click-to-rename in place (title "Click to rename"): Enter or blur
  commits, Escape cancels, an empty name falls back to "My project", and the field stops at
  200 characters (§3).
- Pills drag-reorder by pressing anywhere on the pill except the rename field and the action
  buttons; the drop side follows the pointer past the pill's vertical midpoint; the new order
  persists as `sort_order`.
- Hovering a pill reveals a delete × ("Delete project"), and so does keyboard focus on it.
  Deleting asks first through the delete confirmation (below), then cascades (§3). If the
  deleted project was active, the first remaining live project opens, or the interview when
  none remain.
- A project is **finished** when it has at least one phase and every phase is done. Finished
  pills show an archive icon at rest ("Archive (finished) — move to the archive"); ticking
  the last phase makes it appear without a reload. Archiving stamps `archived_at`; if the
  archived project was active, the first remaining live project opens, or the interview when
  none remain.
- The last pill is "+ New project", which opens the interview (§13).

**Archive view** lists archived projects, most recently archived first, each with its dot,
name and "archived {Mon d}". Two actions: restore ("Restore — bring this project back"),
which clears `archived_at`, appends the project to the end of the live list and opens it; and
delete × ("Delete permanently"), which asks through the same delete confirmation. Empty
state: "Nothing archived yet. Finish a project and you can tuck it away here."

**The archive screen** (`src/archive/ArchiveScreen.tsx`) keeps the archive reachable when
every project is archived: with no live project the gate shows the interview, and any
interview with N > 0 archived projects (the first-run one or "+ New project") shows a "View
archive (N)" link that opens this standalone list — title "Archive", sub-line "Projects
you've finished and tucked away. Restore one to pick it back up, or remove it for good.", and
"← Back", which re-runs the gate (the dashboard when a live project exists, else the
interview). Rows offer "Restore" (which opens the project) and × ("Delete permanently"), which
asks through the same delete confirmation; deleting the last one re-runs the gate. Empty
state: "Nothing archived yet."

**The delete confirmation** (`src/dashboard/DeleteConfirm.tsx`) is one small panel inside
Compass, the same on all three surfaces — a pill, a row of the Archive view, a row of the
archive screen; nothing in Compass asks through the browser's own confirm box. It shows
`Delete "{name}"?`, the line "This removes its phases, tasks, learning, thoughts and time
history.", a muted "Cancel" and a primary "Delete". It opens beside the × that asked — to its
right, else its left, else below or above it, overlapping its row when the window is too
narrow for either side — kept 16 px inside the window and placed again on a resize or a
scroll; when that × has left the page, it sits centred in the window. It is a
`role="dialog"` labelled by its title and described by its line. Focus moves to Cancel when it
opens, and Tab and Shift+Tab go round its two buttons. Cancel and Escape close it and return
focus to the ×; a press anywhere outside it and its × closes it, is not blocked, and leaves
focus where that press put it; none of the three deletes anything. Opening it from the sidebar closes an open
Settings panel (§14), so one panel is open at a time. Delete removes the project as above and
moves focus nowhere, since the × leaves with its project. It
is state inside the surface that opened it (I9), drawn into the page's body so no card or pill
clips it or receives its clicks. Archiving asks nothing.

Accessible names in the sidebar: "Delete {name}", "Archive {name}", "Restore {name}"; the
standalone archive screen's restore button is named only "Restore".

The Settings button sits at the bottom of the sidebar (§14). Above it is the **Companion**
button, a small window glyph and the word, in the Settings button's style: it opens the
companion window, or brings it forward when it is open (§23). Its tooltip is "Open the small
companion window", and while the companion is open "The companion is open: bring it forward"
with the button shown as active.
