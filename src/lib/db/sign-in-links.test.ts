import { describe, expect, it } from "vitest";
import { cleanAuthRedirectErrorUrl, getAuthRedirectError, isPasswordRecoveryUrl } from "../db";

describe("isPasswordRecoveryUrl", () => {
  it("detects implicit recovery links in the URL hash", () => {
    expect(
      isPasswordRecoveryUrl("https://compass.test/#access_token=abc&type=recovery&refresh_token=def"),
    ).toBe(true);
  });

  it("detects recovery links in query params", () => {
    expect(isPasswordRecoveryUrl("https://compass.test/?type=recovery")).toBe(true);
  });

  it("detects redirect_type recovery markers", () => {
    expect(isPasswordRecoveryUrl("https://compass.test/?redirect_type=recovery")).toBe(true);
    expect(isPasswordRecoveryUrl("https://compass.test/#redirect_type=recovery")).toBe(true);
  });

  it("ignores ordinary auth callback URLs", () => {
    expect(isPasswordRecoveryUrl("https://compass.test/#access_token=abc&type=signup")).toBe(false);
    expect(isPasswordRecoveryUrl("https://compass.test/")).toBe(false);
  });

  it("treats malformed input as not recovery", () => {
    expect(isPasswordRecoveryUrl("not a url")).toBe(false);
  });
});

describe("auth redirect errors", () => {
  it("reads Supabase OAuth errors from query params", () => {
    expect(
      getAuthRedirectError(
        "https://compass.test/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+not+found+or+expired",
      ),
    ).toEqual({
      code: "bad_oauth_state",
      description: "OAuth state not found or expired",
    });
  });

  it("reads Supabase OAuth errors from hash params", () => {
    expect(
      getAuthRedirectError("https://compass.test/#error=server_error&error_description=Try+again"),
    ).toEqual({
      code: "server_error",
      description: "Try again",
    });
  });

  it("returns null when the URL has no auth error", () => {
    expect(getAuthRedirectError("https://compass.test/?tab=login")).toBeNull();
  });

  it("cleans auth error params while preserving unrelated params", () => {
    expect(
      cleanAuthRedirectErrorUrl(
        "https://compass.test/?tab=login&error=invalid_request&error_code=bad_oauth_state#mode=auth&error_description=Expired",
      ),
    ).toBe("https://compass.test/?tab=login#mode=auth");
  });
});
