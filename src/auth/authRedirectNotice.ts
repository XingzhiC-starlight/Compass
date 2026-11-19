import type { AuthRedirectError } from "../lib/db";

const EMAIL_LINK_NOTICE =
  "That link from your email no longer works. Links can be used once. If you were resetting your password, “Forgot password?” sends a new one; if you were confirming your account, try signing in.";
const GOOGLE_EXPIRED_NOTICE = "That Google sign-in link expired. Try continuing with Google again.";
const GOOGLE_GENERAL_NOTICE = "Google sign-in didn't finish. Try again when you're ready.";

export function authRedirectNotice(err: AuthRedirectError): string {
  const code = err.code.toLowerCase();
  const description = err.description.toLowerCase();

  if (code.startsWith("otp_") || description.includes("email link")) return EMAIL_LINK_NOTICE;

  const text = `${code} ${description}`;
  if (text.includes("state") || text.includes("expired")) return GOOGLE_EXPIRED_NOTICE;
  return GOOGLE_GENERAL_NOTICE;
}
