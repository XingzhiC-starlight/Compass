## §5 Auth

Code: `src/auth/`, `src/lib/recoveryLink.ts`, `src/lib/db.ts`, `supabase/templates/recovery.html` · Keeps: I5, I6, I13

Accounts use Supabase Auth with two methods: Google OAuth and email + password. Every auth
call shares one redirect contract (I5). The screens live in `src/auth/`; the seam calls are
the auth functions of `src/lib/db.ts`.

**The login screen** (`LoginScreen.tsx`) has three modes — sign in, register, forgot —
switched by quiet text links: "New here? Create an account" and "Forgot password?" from
sign-in, "Already have an account? Sign in" from register, "Back to sign in" from forgot.
Switching clears errors, the password fields and the CAPTCHA. Above the form sit the
"Compass" wordmark — a button back to the landing page, labelled "Back to the Compass home
page" — and the tagline "A quiet place to see where you are — in time, in plan, in learning."

- **Fields:** email (placeholder "you@example.com"); password (absent in forgot mode); in
  register also "Confirm password" and the live checklist "Password should include", whose
  rows turn from muted to filled as each rule is met.
- **Submit labels:** "Sign in", "Create account", "Send reset link"; "One moment…" while busy.
  Below an "or" divider: "Continue with Google", which starts the OAuth redirect; if that
  cannot start: "Couldn't reach Google sign-in just now — try again."
- **Client-side checks** before any call: "Enter your email to continue.", "Enter your
  password to continue." (sign-in), and for register the password policy.
- **Password policy** (`passwordRules.ts`, shared with the recovery screen): at least 8
  characters, one lowercase letter, one uppercase letter, one number, one special character
  (whitespace does not count), and the two entries match. The first unmet rule blocks with
  "Enter the same password twice." or "Use a password that meets all the requirements below."
- **Email confirmation is on.** After register (when Supabase reports that confirmation is
  needed) and after a reset request, the card becomes the inbox state: eyebrow "Email sent",
  title "Check your email", the address in a pill, and a body that never reveals whether an
  account exists — "If this address can create or confirm a Compass account, a confirmation
  link will arrive at {email}. Already created one? Sign in instead." or "If that address has
  a Compass account, a reset link is on its way to {email}." Beneath: "Didn't get the email?"
  and a resend button that counts down "Resend in Ns" for 60 seconds, then reads "Resend
  confirmation link" / "Resend reset link", and "Sending…" while a resend is in flight. A
  successful resend restarts the countdown and
  notes "We sent another confirmation link. Use the newest email if more than one arrives." /
  "If that address has a Compass account, another reset link is on its way." A refused resend
  keeps the inbox state — an earlier email did go out — shows the calm error inside the resend
  panel and restarts the countdown as well; a resend blocked because the CAPTCHA is not yet
  solved sends nothing and restarts nothing. Two ways out:
  "Back to sign in" and "Use a different email", which returns to the mode that sent the
  email. A reset request, like a registration, waits for Supabase's answer: while it is in
  flight the submit button reads "One moment…" and the form is disabled, and the inbox state
  appears only once the request was accepted. When the request is refused — by Supabase or by
  the network — the form stays in its forgot mode with the address still filled in and the
  calm error, and nothing on screen says an email was sent. The resend CAPTCHA
  renders once the countdown ends.
- **Turnstile CAPTCHA** (`AuthTurnstile.tsx`): with a site key present the widget renders in
  every email mode and on the inbox resend, and submitting without a solved token is blocked
  with "Complete the verification check to continue."; the token is reset after every error,
  mode switch and successful send. Without a site key the widget renders nothing and
  submissions proceed (I6). Google sign-in never uses the CAPTCHA. The seam passes a token
  only when it has one; the requirement is enforced by the UI. The widget is always asked for
  Cloudflare's light theme, whatever the viewer's system theme, and for the box that fits the
  screen (`captchaSize.ts`): the normal box, or the compact one on a narrow screen so the card
  stays centred on a phone (DS §6.1). The box is chosen when the widget appears. In the resend
  panel the widget sits clear of the resend button.
- **Calm error copy** (`friendlyError` in `LoginScreen.tsx`): "That email is already
  registered — try signing in instead." · "Use a different password. Avoid common or reused
  passwords." (a leaked or breached password) · "Complete the verification check to continue."
  · "Use a password that meets all the requirements below." · "That email and password don't
  match. Try again." · "Please confirm your email first — check your inbox for the link." ·
  otherwise "Something didn't go through — try again in a moment." A sign-in with a wrong
  password gets the same "don't match" line whether or not an account uses that email. A
  reset request refused
  for asking too often gets that general line too, never one of its own, so the copy cannot
  hint that an address has an account. A failed Google redirect
  or a dead email link shows the gate's notice (§2) above the form.
- **Privacy links:** "You can read how Compass handles privacy." on the form and "Questions
  about your data? Read the privacy notice." on the inbox state, both opening
  `/privacy.html` in a new tab.

**Password recovery** (`SetNewPassword.tsx`). A reset link returns to the app carrying a
recovery marker (`type=recovery` or `redirect_type=recovery` in the query or the hash); the
gate routes to the recovery screen and stays there until the new password is saved or "Send
a new reset link" is pressed — the temporary recovery session never counts as a sign-in (§2).

The reset email's link opens Compass directly, carrying a one-time token (`token_hash`) and
the recovery marker. Opening the link spends nothing: the recovery screen first shows a single
step — title "Reset your password", the line "Continue to choose a new password for your
Compass account." and a "Continue" button ("One moment…" while busy). Only pressing the button
asks Supabase to verify the token (`verifyRecoveryToken` in the seam), so a mail scanner that
opens the link, even one that runs the app, leaves the token unspent for the person. The token
is read once and removed from the address bar at once (`src/lib/recoveryLink.ts`), as the error
parameters are (§2); it travels in the part of the address that browsers never send to a
server, so it reaches no hosting log. When the verification fails because the token was used
or has expired, which the client tells from an error whose code is `otp_expired` or whose
text says the token is invalid or has expired, the same card reads "This reset link has already been used, or it has expired.
Reset links work once." with one button, "Send a new reset link", which opens the login screen
in its forgot mode. Any other failure reads "Something didn't go through — try again in a
moment." and keeps the Continue button. A link of the older form, which arrives with a
recovery session already in the address, skips the Continue step.

Once verified, the screen reads "Set a new
password" / "Choose a new password for your Compass account.", with "New password" and
"Confirm new password" above the same checklist, and "Save password" ("Saving…" while busy).
Errors (`authErrors.ts`): "Use a different password. Avoid common or reused passwords.",
"Choose a new password that is different from your current one.", "Use a password that meets
all the requirements below.", otherwise "Couldn't update your password — the link may have
expired. Try again." The same-password and leaked-password checks are Supabase's; the client
only translates their errors and never knows the old password. No CAPTCHA and no privacy link
on this screen, in either step: Supabase's verification endpoint runs no CAPTCHA check.

**Session.** The seam caches the signed-in user; the gate re-runs only when the user id
changes, never on a token refresh. Sign-out clears the Supabase session and returns to the
landing page.
