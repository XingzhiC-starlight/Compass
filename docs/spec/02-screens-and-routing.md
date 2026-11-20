## §2 Screens and routing

Code: `src/App.tsx`, `src/lib/projectRouting.ts`, `src/auth/authRedirectNotice.ts` · Keeps: I9, I19

Compass is a single-page app with no URL routing (I9). `src/App.tsx` is a state-based gate
that picks one of eight screens from the session and the project list:

| Screen | Shown when | Component |
|---|---|---|
| loading | the gate's first run is resolving; a later run keeps the screen it has until it resolves (§21) | inline in `App.tsx` |
| landing | no session | `src/landing/Landing.tsx` |
| login | the landing's Log in pills; or no session on a page load that arrived from a failed auth redirect (an expired Google sign-in, or a used or expired email link), so its notice is visible | `src/auth/LoginScreen.tsx` |
| recovery | the page load carries a password-recovery link — either a one-time token awaiting the Continue step, or an already-verified recovery session; sticky until the new password is saved or a new reset link is asked for, so the temporary recovery session is never treated as a sign-in | `src/auth/SetNewPassword.tsx` |
| interview | a session with no live project; or "+ New project" from the sidebar | `src/interview/Interview.tsx` |
| archive | the interview's "View archive (N)" link | `src/archive/ArchiveScreen.tsx` |
| dashboard | a session with at least one live project, showing the active project | `src/dashboard/Dashboard.tsx` |
| error | the gate failed (for example Supabase unreachable): one quiet line, "Compass couldn't load just now.", and a Try again that re-runs the gate | inline in `App.tsx` |

Rules the gate keeps:

- With the data kept on this device (I19) there are no accounts, so there is always a
  session: the gate opens on the setup when there is no live project and on the dashboard
  when there is one, and never shows the landing page, the login screen or the recovery
  screen. An address shaped like a reset link or like a failed sign-in opens the app as any
  other address does. Nothing signs out (§14), and who is signed in never changes, so no
  change of who is signed in ever re-runs the gate; it runs when the page loads, on "Try
  again", and wherever a screen asks for it, as with accounts (§21): after the setup saves,
  on the setup's and the archive screen's "← Back", and after a project is deleted, archived
  or restored. When the device's storage cannot be
  read, or holds a text that is not a Compass database, the gate shows the error screen and
  the stored text is left as it is.
- It re-runs whenever *who* is signed in changes, which is how the return from the Google
  redirect lands on the dashboard and how a sign-out in another tab is noticed. Token
  refreshes do not re-run it.
- With accounts, signing out returns to the landing page. The login screen's "Compass" wordmark also returns
  to the landing.
- The seam holds the active project id and App keeps a copy (§3, §21). When the list changes
  App keeps the current project if it still exists, otherwise the first live project; with
  none it shows the interview. Restoring a project from the archive opens that project.
- App owns the gate and hands each screen what it needs as props: the dashboard the
  sidebar's data and the project-level callbacks, the setup the archived count and its
  callbacks, the other screens their callbacks; there is no auth context provider. Each
  screen and card calls the seam itself for
  its own reads and writes: the dashboard loads its project's payload and the archive screen
  its list (§21). App does not key `Dashboard`, so a project switch reloads only the cards and
  the sidebar stays in place (I11).
- The interview offers "← Back" only when the user already has a live project (§13).
- Components write optimistically; the add boxes and the setup save wait for their answer
  (§9–§13), and so do deleting, archiving and restoring a project, the thought feed's group,
  merge, de-group, pop-out and ungroup, a group's rename, a drop of a thought on a group,
  and signing out (§21). When a save fails, the seam reports it once and App shows a calm note —
  "Couldn't save just now — try again in a moment." — for about four seconds, while the
  screen quietly refreshes from the server: the sidebar's data is re-read and replaced in
  place, and the dashboard re-reads its cards the same way (§7), so nothing unsaved lingers
  on screen. Several failures close together show one note, and a save that succeeds
  refreshes nothing, except one made in the companion, after which the cards are refreshed
  quietly (§23). A refresh that cannot reach the server leaves the screen as it is and
  is tried again when the browser reports the connection back, when the tab is shown again,
  and every 15 seconds, until both its parts, the sidebar's data and the cards, have
  succeeded (§21); signing out drops it. No red, and the note never
  echoes what failed to save.
- A page load that arrives from a failed auth redirect shows one notice above the login form,
  chosen from the error Supabase returned (`src/auth/authRedirectNotice.ts`), and the error
  parameters are stripped from the address bar so a reload does not repeat it.
  - **A used or expired email link** (error code `otp_expired`, any error code beginning
    `otp_`, or a description that mentions an email link): "That link from your email no
    longer works. Links can be used once. If you were resetting your password, “Forgot
    password?” sends a new one; if you were confirming your account, try signing in." It
    never mentions Google, and this rule is checked first.
  - **An expired Google sign-in** (the error names the OAuth state, or is any other error
    whose text contains "expired"): "That Google sign-in link expired. Try continuing with
    Google again."
  - **Anything else:** "Google sign-in didn't finish. Try again when you're ready."

  The three sentences are quoted word for word: a change to any of them changes this section
  in the same pull request.
