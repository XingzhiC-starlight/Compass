# Settings and privacy

The gear at the bottom of the sidebar opens a small non-modal dialog: the privacy notice (same
tab), Log out and the app's version. The privacy notice is a static page with its own Back
link; the login form and the inbox state link it in a new tab. The page head names Compass and
blocks machine translation (spec §14).

## Sub-features

- `set-open` the dialog, its focus on ×, the trigger's aria-haspopup, aria-expanded and aria-controls, its rows and the version.
- `set-dismiss` Escape (focus back on Settings), a click outside, and × close it.
- `set-privacy` Privacy Notice opens /privacy.html in the same tab; Back to Compass returns, still signed in.
- `privacy-notice` the notice says what Compass stores and does, names the five providers, RLS and HTTPS, and the beta's limits.
- `set-log-out` Log out closes the dialog, ends the session, shows the landing page.
- `privacy-links` no privacy link on the landing page; the login form's opens in a new tab.
- `index-head` the title, the description, the theme color equal to primary-100, notranslate.

## How to get to it (user POV)

- "Settings" at the bottom of the sidebar of any dashboard.
- /privacy.html directly, or from the login form's "read how Compass handles privacy" and the
  inbox state's "Read the privacy notice" (§5).

## Driving it with verify.mjs

Preconditions:

- A launched run; the journey sets up "Settled".

Run the whole recipe: `node scripts/verify/verify.mjs journey settings`.

- **`set-open`.** Open Settings. By hand: `click --role button --name Settings --exact`,
  `focused`, `snapshot`. Shows the trigger `aria-haspopup="dialog"` and `aria-expanded` false,
  then true with `aria-controls` naming the dialog; the dialog "Settings" `aria-modal="false"`
  with focus on "Close settings"; the link "Privacy Notice, read our privacy policy" to
  /privacy.html with no `target`; "Log out, sign out from your account"; "Version 1.0.0" (the
  version in package.json).
- **`set-dismiss`.** Escape; open and click the sidebar's empty space; open and ×. By hand:
  `press Escape`, `focused`. Shows the dialog closed each time and focus back on Settings
  after Escape and ×.
- **`set-privacy`.** Open Settings, Privacy Notice, then Back to Compass. By hand:
  `click --role link --name "Privacy Notice, read our privacy policy"`, `url`. Shows
  /privacy.html titled "Compass Privacy Notice" (`…-notice.png`), and the dashboard again.
- **`privacy-notice`.** Read /privacy.html. By hand: `open /privacy.html`, `snapshot`. Shows
  what is stored (interview answers; phases, learning items, tasks, time sessions, thoughts),
  its use to show and sync the dashboard, "do not sell your data", no AI features, third-party
  analytics or error logging over the user's text, Supabase, Vercel, Resend, Cloudflare
  Turnstile, Google OAuth, row-level security, HTTPS, and no data export, account deletion or
  public support mailbox.
- **`set-log-out`.** Settings, Log out, reload. Shows the landing page, the dialog gone, and
  still signed out after the reload.
- **`privacy-links`.** On the landing page, then the login form. Shows no link to
  /privacy.html on the landing page; "read how Compass handles privacy" with
  `target="_blank"`, opening "Compass Privacy Notice" in a new tab.
- **`index-head`.** Read the page head. Shows the title "Compass", the description "Compass — a
  quiet place to see where you are, in time, in plan, in learning.", `theme-color` equal to the
  `--primary-100` the stylesheet defines, `notranslate` on `html`, `body` and `#root`,
  `translate="no"`, and `<meta name="google" content="notranslate">`.

## Gotchas

- A click outside the dialog must land on the sidebar's empty space; on a bubble it also flips
  the dashboard view.
- The privacy page is static and reads no session; Back to Compass reloads the app, which signs
  in again from the browser's stored session.
- The version is read from package.json, so a version bump changes what `set-open` expects
  without any edit to the journey.
