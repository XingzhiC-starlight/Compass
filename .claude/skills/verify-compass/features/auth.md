# Auth

Accounts sign in with email and password (and Google on the live site). The login screen has
three modes — sign in, register, forgot — with calm errors, a password checklist and an inbox
state that never says whether an account exists. A reset email's link opens a two-step recovery
screen; a failed redirect shows one notice above the form (spec §5, the notices in §2).

## Sub-features

- `auth-login-screen` the login screen's parts, its privacy link, and no CAPTCHA box without a site key.
- `auth-client-checks` the empty-email and empty-password lines, with nothing sent.
- `auth-modes` the three modes, and a switch clearing the error and the password.
- `auth-password-rules` the checklist filling rule by rule, and the two blocking lines.
- `auth-register` Create account signs straight in to the first-run setup.
- `auth-register-taken` an address that already has an account.
- `auth-sign-in-refused` a wrong password.
- `auth-sign-in` the right password; no project means the first-run setup.
- `auth-sign-out` Log out ends the session; a reload stays signed out.
- `auth-forgot-inbox` the reset request waiting for its answer, then the inbox state.
- `auth-forgot-no-account` the same inbox state for an address with no account.
- `auth-resend` the 60-second countdown, the resend, its note and its second email.
- `auth-reset-link` the link's first step, the token leaving the address bar, opening spending nothing.
- `auth-new-password` the new-password rules, saving, the old password refused.
- `auth-dead-link` a used link's message and "Send a new reset link".
- `auth-redirect-notices` the three failed-redirect notices and their stripped address.
- `auth-google` not driven: the practice copy has no Google provider; Google sign-in is checked on the live site (docs/deploy.md §6).
- `auth-captcha` not driven: the practice app runs without a Turnstile site key, so only the no-key branch (no box, submissions go through) is shown, by `auth-login-screen`; the hosted CAPTCHA is live-only.
- `auth-confirmation` not driven: the practice copy asks for no confirmation, so registering never reaches the confirmation inbox state or its resend; live-only.

## How to get to it (user POV)

- "Log in" in the landing page's top bar, or the larger "Log in" of its closing call.
- From the login screen: "New here? Create an account", "Forgot password?", and back again.
- The link in a reset email, which opens Compass on the recovery screen.
- Arriving back from a failed Google sign-in or a dead email link (an address carrying `error`,
  `error_code`, `error_description`).
- "Log out, sign out from your account" in Settings (§14) once signed in.

## Driving it with verify.mjs

Preconditions:

- A launched run that `doctor` passes; the journey signs up its own account and registers a
  second one through the screen.

Run the whole recipe: `node scripts/verify/verify.mjs journey auth`.

- **`auth-login-screen`.** Open the landing page and choose Log in. By hand:
  `node scripts/verify/verify.mjs open /`, `click --in .landing-topbar --role button --name "Log in" --exact`,
  `snapshot`. Shows the button "Back to the Compass home page", the tagline, the placeholders
  `you@example.com` and `Password`, Sign in, both mode links, "or", Continue with Google, the link
  "read how Compass handles privacy" with `href="/privacy.html"` `target="_blank"`, and no
  `iframe` from challenges.cloudflare.com.
- **`auth-client-checks`.** Press Sign in empty, then with only an email. By hand:
  `click --role button --name "Sign in" --exact`, `see --text "Enter your email to continue."`.
  Shows each line; the journey records no request to `/auth/v1/`.
- **`auth-modes`.** Type a password, switch to register, back, to forgot, back. By hand:
  `click --role button --name "New here? Create an account"`, `count --placeholder "Confirm password"`.
  Register shows Confirm password and six checklist rows, the password field empty and the
  error gone; forgot has no password field and reads "Send reset link".
- **`auth-password-rules`.** Register with "weak" twice, then a strong password and a different
  confirmation. Shows the lowercase and match rows filled and the rest muted (the row's dot),
  then "Use a password that meets all the requirements below.", then "Enter the same password
  twice.".
- **`auth-register`.** Confirm the strong password and Create account. Shows the setup screen
  ("Open my dashboard →", no ← Back); the new account signs in at the practice copy and owns no
  project (`04`/`05-…rows.json`).
- **`auth-register-taken`.** A new visit registers the journey's own address. Shows "That
  email is already registered — try signing in instead." (the answer is a 422
  `user_already_exists`, in `error-answers.log`).
- **`auth-sign-in-refused`.** Sign in with a wrong password. By hand: `fill` the fields with
  placeholders `you@example.com` and `Password` (`--exact`), then
  `click --role button --name "Sign in" --exact`. Shows "That email and password don't match.
  Try again."
- **`auth-sign-in`.** The right password. By hand: `node scripts/verify/verify.mjs sign-in`.
  Shows the first-run setup.
- **`auth-sign-out`.** Set up a project, Log out from Settings, reload. Shows the landing page,
  still signed out after the reload.
- **`auth-forgot-inbox`.** Forgot password?, the address, Send reset link with the request held.
  Shows "One moment…" and the disabled field while held (`…-in-flight.png`), then "Email sent",
  "Check your email", the address in a pill, the line "If that address has a Compass account, a
  reset link is on its way to …", "Didn't get the email?", a disabled "Resend in Ns", "Back to
  sign in", "Use a different email" and "Read the privacy notice" in a new tab.
- **`auth-forgot-no-account`.** Use a different email: an address with no account. Shows the
  same card with that address.
- **`auth-resend`.** A new visit with the page clock running; ask for a reset, wait for the
  email, move the clock 61 s on. Journey only. Shows "Resend reset link" enabled
  (`…-countdown-over.png`), then "If that address has a Compass account, another reset link is
  on its way.", the countdown back at 60 s, and a second email in the practice inbox.
- **`auth-reset-link`.** Ask for a reset, open the email's link (read from the practice inbox,
  never printed). Shows "Reset your password", its line and Continue, no link on the screen,
  and no `token_hash` left in the address. A second visit opens the same link and continues:
  "Set a new password", both fields, the checklist.
- **`auth-new-password`.** Save "weak", then a strong password. Shows the checklist's line,
  then the setup (signed in); the practice copy refuses the old password and accepts the new.
- **`auth-dead-link`.** A new visit opens the used link and presses Continue. Shows "This reset
  link has already been used, or it has expired. Reset links work once." (`…-used.png`), and
  "Send a new reset link" opens the forgot mode.
- **`auth-redirect-notices`.** Open `/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
  `/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+parameter+missing`
  and `/?error=server_error&error_description=Unexpected+failure`, each in a new visit. By hand:
  `open "/?error=server_error&error_description=Unexpected+failure"`, `url`. Shows the
  email-link notice, the Google-expired notice and the general notice above the form; the
  address keeps no error, and a reload shows the landing page.

## Gotchas

- The practice copy sends one email to an address per second at most and answers a faster
  request 429 `over_email_send_rate_limit`; the journey spaces its requests by 1.5 s.
- The fake clock belongs to the browser context: a reset requested in a clocked visit is still
  spent at the server's own time; only the page's countdown moves.
- A reset link differs from the current address only after `#`, so it must be opened from a
  blank page (the journey does) or the app does not load again.
- React's development build prints a warning when a checklist row flips from met to unmet (the
  row's dot mixes `border` with `borderColor` in `src/auth/PasswordChecklist.tsx`); the three
  password steps allow exactly that message, so any other still fails them.
- Registering leaves an account in the practice copy until cleanup removes it; a run cut off
  before cleanup leaves it until `cleanup --every-verify-account` or `npm run practice:reset`.
- Changing the password of one of the two recorded practice accounts breaks `npm run test:db`
  and `npm run test:browser`; the journey only ever resets its own account.
