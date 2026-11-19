/* Preview stories for PasswordChecklist — the calm password-rule list
   shown under the register / set-new-password fields. Rules light up
   (muted → ink dot) as the password satisfies them; the last rule checks
   that both fields match. It's self-contained (own border + wash), so
   cells only need an auth-form-width wrapper. */
import { PasswordChecklist } from "compass";

const wrap = { width: 340 } as const;

/** Untouched — every rule still open, the state before typing begins. */
export const AllUnmet = () => (
  <div style={wrap}>
    <PasswordChecklist password="" confirmation="" />
  </div>
);

/** Mid-typing — lowercase, number and length met; case, special char and match still open. */
export const PartiallyMet = () => (
  <div style={wrap}>
    <PasswordChecklist password="compass2026" confirmation="" />
  </div>
);

/** Ready to submit — a strong password entered identically twice. */
export const AllMet = () => (
  <div style={wrap}>
    <PasswordChecklist password="Compass!Beta42" confirmation="Compass!Beta42" />
  </div>
);
