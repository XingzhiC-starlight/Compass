import { describe, expect, it } from "vitest";
import { isUsedOrExpiredLinkError, passwordResetErrorMessage } from "./authErrors";

describe("passwordResetErrorMessage", () => {
  it("explains when Supabase rejects reusing the current password", () => {
    expect(
      passwordResetErrorMessage(new Error("New password should be different from the old password.")),
    ).toBe("Choose a new password that is different from your current one.");
  });

  it("keeps leaked-password guidance specific", () => {
    expect(passwordResetErrorMessage(new Error("Password has been pwned."))).toBe(
      "Use a different password. Avoid common or reused passwords.",
    );
  });
});

describe("isUsedOrExpiredLinkError", () => {
  it("recognises Supabase's used-or-expired token error by its code", () => {
    const err = Object.assign(new Error("Token has expired or is invalid"), { code: "otp_expired" });
    expect(isUsedOrExpiredLinkError(err)).toBe(true);
  });

  it("recognises it by its message when no code is present", () => {
    expect(isUsedOrExpiredLinkError(new Error("Email link is invalid or has expired"))).toBe(true);
  });

  it("treats a rate limit, a network failure and a non-error as worth another try", () => {
    const rateLimited = Object.assign(new Error("Request rate limit reached"), {
      code: "over_request_rate_limit",
    });
    expect(isUsedOrExpiredLinkError(rateLimited)).toBe(false);
    expect(isUsedOrExpiredLinkError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isUsedOrExpiredLinkError("otp_expired")).toBe(false);
  });
});
