/* Preview stories for LoginScreen — the sign-in screen (email + password
   form, mode links, "or" divider, Continue with Google, privacy footnote).
   Its outer wrap is an inline-styled 100vw/100vh centering grid, so each
   cell hosts it in a .ds-auth-host that flattens those viewport units back
   to the cell width (CSS !important beats the inline style).
   Register / forgot / "check your email" shapes are click-driven internal
   state — not statically reachable, so they're skipped here.
   Turnstile is unconfigured in previews and renders nothing (expected). */
import { LoginScreen } from "compass";

const hostCss = `
  .ds-auth-host > div:first-child {
    width: 100% !important;
    min-height: 0 !important;
  }
`;

/** Default sign-in: email + password, mode links, Google button. */
export const SignIn = () => (
  <div className="ds-auth-host" style={{ width: 520 }}>
    <style>{hostCss}</style>
    <LoginScreen />
  </div>
);

/** With a routing notice — e.g. arriving back after a password update. */
export const WithNotice = () => (
  <div className="ds-auth-host" style={{ width: 520 }}>
    <style>{hostCss}</style>
    <LoginScreen notice="Your password was updated. Sign in with your new password." />
  </div>
);
