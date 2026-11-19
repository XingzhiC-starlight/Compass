/* Preview stories for SetNewPassword — the password-recovery screen shown
   when arriving from a reset link: two password fields + the live
   requirements checklist + Save. The checklist's met/unmet states and the
   error line are typing/submit-driven internal state, so the honest static
   cell is the fresh recovery form (all requirements pending).
   Same .ds-auth-host trick as LoginScreen to flatten the 100vw/100vh wrap. */
import { SetNewPassword } from "compass";

const hostCss = `
  .ds-auth-host > div:first-child {
    width: 100% !important;
    min-height: 0 !important;
  }
`;

/** Fresh recovery form — new password, confirm, checklist, Save. */
export const Recovery = () => (
  <div className="ds-auth-host" style={{ width: 520 }}>
    <style>{hostCss}</style>
    <SetNewPassword onDone={() => {}} />
  </div>
);
