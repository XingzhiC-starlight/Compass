## §14 Settings and privacy

Code: `src/dashboard/Sidebar.tsx`, `public/privacy.html`, `index.html`

A "Settings" button (gear) sits at the bottom of the sidebar and opens a small dialog titled
"Settings" with a close ×. Its rows: **Privacy Notice** ("Read our privacy policy"), a link
to `/privacy.html` in the same tab; a divider; **Log out** ("Sign out from your account"),
which closes the panel, ends the session and returns to the landing page; and the line
"Version {version}", where the version is `package.json`'s, injected by Vite as
`__APP_VERSION__`. The dialog light-dismisses on a click outside, closes on Escape (returning
focus to the button), and moves focus to its close button when it opens. It is a
non-modal `role="dialog"` labelled by its heading; the trigger carries `aria-haspopup`,
`aria-expanded` and, while open, `aria-controls`, with ids from `useId`.

**The privacy notice** (`public/privacy.html`) is a standalone static page titled "Compass
Privacy Notice" with a "Back to Compass" link. It states what Compass stores (account
metadata plus project content: interview answers, phases, learning items, tasks, time
sessions, thoughts), that the data is used only to run and sync the app, that nothing is
sold and no AI, analytics or error logging runs over the user's text, names the five
providers (Supabase, Vercel, Resend, Cloudflare Turnstile, Google OAuth), states RLS and
HTTPS, and says plainly that the beta has no data export, no account deletion and no support
mailbox. It is linked from the login form and the inbox state (both in a new tab) and from
Settings (same tab); the landing page and the recovery screen do not link it.

`index.html` sets the title "Compass", the description "Compass — a quiet place to see where
you are, in time, in plan, in learning.", a theme color equal to the primary-100 background
(`DESIGN-SYSTEM.md`), and marks the document notranslate. Machine translation is blocked on
purpose: Google Translate rewrites the DOM and caused intermittent React failures when
deleting interview rows, and loosening the CSP for its injected stylesheet was rejected in
favor of first-party localization if it is ever needed.
