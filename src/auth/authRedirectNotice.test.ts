import { describe, expect, it } from "vitest";
import { authRedirectNotice } from "./authRedirectNotice";
import type { AuthRedirectError } from "../lib/db";

const EMAIL_LINK_NOTICE =
  "That link from your email no longer works. Links can be used once. If you were resetting your password, “Forgot password?” sends a new one; if you were confirming your account, try signing in.";
const GOOGLE_EXPIRED_NOTICE =
  "That Google sign-in link expired. Try continuing with Google again.";
const GOOGLE_GENERAL_NOTICE =
  "Google sign-in didn't finish. Try again when you're ready.";

function err(code: string, description: string): AuthRedirectError {
  return { code, description };
}

describe("the three acceptance checks on the pure mapping", () => {
  it('An auth-redirect error with code `otp_expired` and description "Email link is invalid or has expired" maps to the email-link notice, and that notice does not contain the word "Google"', () => {
    const notice = authRedirectNotice(
      err("otp_expired", "Email link is invalid or has expired"),
    );
    expect(notice).toBe(EMAIL_LINK_NOTICE);
    expect(notice).not.toContain("Google");
    expect(notice.toLowerCase()).not.toContain("google");
  });

  it('An error with code `bad_oauth_state` and description "OAuth state not found or expired" maps to "That Google sign-in link expired. Try continuing with Google again."', () => {
    const notice = authRedirectNotice(
      err("bad_oauth_state", "OAuth state not found or expired"),
    );
    expect(notice).toBe(GOOGLE_EXPIRED_NOTICE);
  });

  it('An error that is neither (code `unexpected_failure`, description "Unable to exchange external code") maps to "Google sign-in didn\'t finish. Try again when you\'re ready."', () => {
    const notice = authRedirectNotice(
      err("unexpected_failure", "Unable to exchange external code"),
    );
    expect(notice).toBe(GOOGLE_GENERAL_NOTICE);
  });
});

describe("the rule details behind those checks", () => {
  it("An auth-redirect error maps to the email-link notice — rule detail: ANY error code beginning `otp_`, not only `otp_expired`", () => {
    const notice = authRedirectNotice(
      err("otp_disabled", "One-time links are not available right now"),
    );
    expect(notice).toBe(EMAIL_LINK_NOTICE);
    expect(notice.toLowerCase()).not.toContain("google");
  });

  it("An auth-redirect error maps to the email-link notice — rule detail: a description that mentions an email link, whatever the code is", () => {
    const notice = authRedirectNotice(
      err("access_denied", "Email link is invalid or has expired"),
    );
    expect(notice).toBe(EMAIL_LINK_NOTICE);
    expect(notice.toLowerCase()).not.toContain("google");
  });

  it('An error with code `bad_oauth_state` maps to "That Google sign-in link expired…" — rule detail: the error names the OAuth state, even when the word "expired" is absent', () => {
    const notice = authRedirectNotice(
      err("bad_oauth_state", "OAuth callback state is missing"),
    );
    expect(notice).toBe(GOOGLE_EXPIRED_NOTICE);
  });

  it('An error maps to "That Google sign-in link expired…" — rule detail: any OTHER error whose text contains "expired" (and is not an email link)', () => {
    const notice = authRedirectNotice(
      err("flow_state_expired", "The sign-in flow state has expired"),
    );
    expect(notice).toBe(GOOGLE_EXPIRED_NOTICE);
  });

  it('An error that is neither maps to "Google sign-in didn\'t finish…" — rule detail: a cancelled Google sign-in (no otp code, no email link, nothing expired)', () => {
    const notice = authRedirectNotice(
      err("access_denied", "The user denied the request"),
    );
    expect(notice).toBe(GOOGLE_GENERAL_NOTICE);
  });

  it('An auth-redirect error that maps to the email-link notice never yields the word "Google" — checked across every email-link shape', () => {
    const emailLinkErrors: AuthRedirectError[] = [
      err("otp_expired", "Email link is invalid or has expired"),
      err("otp_expired", ""),
      err("otp_disabled", "One-time links are not available right now"),
      err("access_denied", "Email link is invalid or has expired"),
    ];
    for (const e of emailLinkErrors) {
      const notice = authRedirectNotice(e);
      expect(notice, JSON.stringify(e)).toBe(EMAIL_LINK_NOTICE);
      expect(notice.toLowerCase(), JSON.stringify(e)).not.toContain("google");
    }
  });
});
