## §14 Settings and privacy

Code: `src/dashboard/Sidebar.tsx`, `src/dashboard/useTheme.ts`, `public/privacy.html`, `index.html` · Keeps: I19

A "Settings" button (gear) sits at the bottom of the sidebar and opens a small dialog titled
"Settings" with a close ×. It opens with **Theme**, a group named "Theme" of two buttons,
"Classic" and "Sand", the one in use pressed (`aria-pressed`), and a divider under it. What
it holds below that depends on where the data is kept (I19), which the sidebar asks the seam
(`storesOnThisDevice`).

With the data kept on this device, the dialog holds two lines of text under the theme and
nothing else to press but the close ×: **Saved on this device** over "No account. Your work
stays on this device.", in the title and subtitle styles of a row, and the line "Version
{version}". There is no privacy notice link, no second divider and no Log out, since there
is no account and no provider holds the data.

With accounts, the rows under the theme are: **Privacy Notice** ("Read our privacy policy"), a link
to `/privacy.html` in the same tab; a divider; **Log out** ("Sign out from your account"),
which closes the panel, ends the session and returns to the landing page; and the line
"Version {version}". In both, the version is `package.json`'s, injected by Vite as
`__APP_VERSION__`. The dialog light-dismisses on a click outside, closes on Escape (returning
focus to the button), and moves focus to its close button when it opens. It is a
non-modal `role="dialog"` labelled by its heading; the trigger carries `aria-haspopup`,
`aria-expanded` and, while open, `aria-controls`, with ids from `useId`.

**The theme** is the dashboard's look, one of two. Classic, the default, gives each card its
module's wash and edge on the `--bg` page. Sand puts the page, the sidebar and the four cards
on the sand family alone; the module accents stay (`DESIGN-SYSTEM.md` §12). A press on
either button changes the look at once and leaves the dialog open. The choice is kept in this
browser only, in `localStorage["compass.theme"]`, as `classic` or `sand`: no database row
holds it, so it does not follow the account to another browser, and it survives a sign-out.
Anything but `sand` there, or storage that cannot be read, is Classic; where storage refuses
the write, the choice holds until the page is closed. The sidebar reads the choice once as
it mounts (`useTheme`) and, while it is mounted, marks the document root `data-theme="sand"`
for Sand and leaves it unmarked for Classic; it takes the mark off as it unmounts. So only
the dashboard changes, and its companion with it, whose window carries the same mark (§23):
the landing page, the sign-in and recovery screens, the setup, the archive screen and the
privacy notice look the same under either choice. In the desktop app (§22) the choice is
kept the same way, in the storage of the app's own page, and not in the data file.

**The privacy notice** (`public/privacy.html`) is a standalone static page titled "Compass
Privacy Notice" with a "Back to Compass" link. It states what Compass stores (account
metadata plus project content: interview answers, phases, learning items, tasks, time
sessions, thoughts), that the data is used only to run and sync the app, that nothing is
sold and no AI, analytics or error logging runs over the user's text, names the five
providers (Supabase, Vercel, Resend, Cloudflare Turnstile, Google OAuth), states RLS and
HTTPS, and says plainly that the beta has no data export, no account deletion and no support
mailbox. It is linked from the login form and the inbox state (both in a new tab) and from
Settings (same tab); the landing page and the recovery screen do not link it. It describes
the hosted service: with the data kept on this device nothing links to it.

`index.html` sets the title "Compass", the description "Compass — a quiet place to see where
you are, in time, in plan, in learning.", a theme color equal to the primary-100 background
(`DESIGN-SYSTEM.md`), and marks the document notranslate. Machine translation is blocked on
purpose: Google Translate rewrites the DOM and caused intermittent React failures when
deleting interview rows, and loosening the CSP for its injected stylesheet was rejected in
favor of first-party localization if it is ever needed.
