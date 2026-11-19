import { afterEach, describe, expect, it } from "vitest";
import {
  classifyRecoveryLink,
  cleanRecoveryTokenUrl,
  consumeRecoveryToken,
  recoveryTokenHash,
} from "./recoveryLink";

const ORIGIN = "https://compass.example";
const TOKEN = "tok_9f8e7d6c5b4a";

const PENDING_HASH = `${ORIGIN}/#token_hash=${TOKEN}&type=recovery`;
const PENDING_QUERY = `${ORIGIN}/?token_hash=${TOKEN}&type=recovery`;

const VERIFIED_HASH = `${ORIGIN}/#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery`;
const VERIFIED_QUERY = `${ORIGIN}/?access_token=aaa.bbb.ccc&refresh_token=rrr&type=recovery`;

const GOOGLE_CALLBACK_HASH = `${ORIGIN}/#access_token=aaa.bbb.ccc&expires_in=3600&provider_token=ppp&refresh_token=rrr&token_type=bearer`;
const GOOGLE_CALLBACK_CODE = `${ORIGIN}/?code=4f1c2d3e`;
const SIGNUP_CONFIRM_HASH = `${ORIGIN}/#access_token=aaa.bbb.ccc&refresh_token=rrr&token_type=bearer&type=signup`;
const PLAIN = `${ORIGIN}/`;

function hashParams(url: string): URLSearchParams {
  return new URLSearchParams(new URL(url).hash.replace(/^#/, ""));
}

describe("classifyRecoveryLink", () => {
  it("An address carrying a one-time token with `type=recovery` is recognised as a recovery link awaiting Continue (token after `#`)", () => {
    expect(classifyRecoveryLink(PENDING_HASH)).toBe("pending");
  });

  it("An address carrying a one-time token with `type=recovery` is recognised as a recovery link awaiting Continue (token in the query string)", () => {
    expect(classifyRecoveryLink(PENDING_QUERY)).toBe("pending");
  });

  it("An address carrying an access token with `type=recovery` is recognised as an already-verified recovery link (after `#`)", () => {
    expect(classifyRecoveryLink(VERIFIED_HASH)).toBe("verified");
  });

  it("An address carrying an access token with `type=recovery` is recognised as an already-verified recovery link (in the query string)", () => {
    expect(classifyRecoveryLink(VERIFIED_QUERY)).toBe("verified");
  });

  it("An address carrying an access token is recognised as an already-verified recovery link when the marker is `redirect_type=recovery` (spec §5's second marker)", () => {
    expect(
      classifyRecoveryLink(`${ORIGIN}/?redirect_type=recovery#access_token=aaa.bbb.ccc&refresh_token=rrr`),
    ).toBe("verified");
    expect(
      classifyRecoveryLink(`${ORIGIN}/#access_token=aaa.bbb.ccc&refresh_token=rrr&redirect_type=recovery`),
    ).toBe("verified");
  });

  it("An ordinary sign-in callback is neither: a Google callback with a session after `#` and no recovery marker", () => {
    expect(classifyRecoveryLink(GOOGLE_CALLBACK_HASH)).toBeNull();
  });

  it("An ordinary sign-in callback is neither: a `?code=` callback, an email-confirmation callback (`type=signup`), and a plain page load", () => {
    expect(classifyRecoveryLink(GOOGLE_CALLBACK_CODE)).toBeNull();
    expect(classifyRecoveryLink(SIGNUP_CONFIRM_HASH)).toBeNull();
    expect(classifyRecoveryLink(PLAIN)).toBeNull();
  });

  it("An ordinary sign-in callback is neither: a one-time token whose type is NOT recovery (an email-confirmation token) is not a recovery link", () => {
    expect(classifyRecoveryLink(`${ORIGIN}/#token_hash=${TOKEN}&type=signup`)).toBeNull();
    expect(classifyRecoveryLink(`${ORIGIN}/?token_hash=${TOKEN}&type=email`)).toBeNull();
  });

  it("An ordinary sign-in callback is neither: a string that is not a valid address is `null`, and never throws", () => {
    expect(classifyRecoveryLink("not an address")).toBeNull();
    expect(classifyRecoveryLink("http://")).toBeNull();
  });
});

describe("recoveryTokenHash", () => {
  it("An address carrying a one-time token with `type=recovery` gives up that token — from after `#` and from the query string", () => {
    expect(recoveryTokenHash(PENDING_HASH)).toBe(TOKEN);
    expect(recoveryTokenHash(PENDING_QUERY)).toBe(TOKEN);
  });

  it("An address carrying an access token with `type=recovery` (already verified) has no one-time token: `null`", () => {
    expect(recoveryTokenHash(VERIFIED_HASH)).toBeNull();
    expect(recoveryTokenHash(VERIFIED_QUERY)).toBeNull();
  });

  it("An ordinary sign-in callback is neither, so it has no one-time token: `null` (also a plain load, a non-recovery token, and an invalid address)", () => {
    expect(recoveryTokenHash(GOOGLE_CALLBACK_HASH)).toBeNull();
    expect(recoveryTokenHash(GOOGLE_CALLBACK_CODE)).toBeNull();
    expect(recoveryTokenHash(PLAIN)).toBeNull();
    expect(recoveryTokenHash(`${ORIGIN}/#token_hash=${TOKEN}&type=signup`)).toBeNull();
    expect(recoveryTokenHash("not an address")).toBeNull();
  });
});

describe("cleanRecoveryTokenUrl", () => {
  it("The token is gone from the address bar: the cleaned address holds neither the token nor its `type` marker (token after `#`)", () => {
    const cleaned = cleanRecoveryTokenUrl(PENDING_HASH);
    expect(cleaned).not.toContain("token_hash");
    expect(cleaned).not.toContain(TOKEN);
    expect(cleaned).not.toContain("type=recovery");
    expect(hashParams(cleaned).has("type")).toBe(false);
    expect(new URL(cleaned).origin).toBe(ORIGIN);
    expect(new URL(cleaned).pathname).toBe("/");
    expect(classifyRecoveryLink(cleaned)).toBeNull();
  });

  it("The token is gone from the address bar: the cleaned address holds neither the token nor its `type` marker (token in the query string)", () => {
    const cleaned = cleanRecoveryTokenUrl(PENDING_QUERY);
    expect(cleaned).not.toContain("token_hash");
    expect(cleaned).not.toContain(TOKEN);
    expect(cleaned).not.toContain("type=recovery");
    expect(new URL(cleaned).searchParams.has("type")).toBe(false);
    expect(new URL(cleaned).origin).toBe(ORIGIN);
    expect(new URL(cleaned).pathname).toBe("/");
    expect(classifyRecoveryLink(cleaned)).toBeNull();
  });

  it("The token is gone from the address bar, and every other parameter is kept — in the query string and after `#`", () => {
    const hashForm = cleanRecoveryTokenUrl(
      `${ORIGIN}/?ref=mail#token_hash=${TOKEN}&type=recovery&view=compact`,
    );
    expect(hashForm).not.toContain(TOKEN);
    expect(new URL(hashForm).searchParams.get("ref")).toBe("mail");
    expect(hashParams(hashForm).get("view")).toBe("compact");
    expect(hashParams(hashForm).has("token_hash")).toBe(false);
    expect(hashParams(hashForm).has("type")).toBe(false);

    const queryForm = cleanRecoveryTokenUrl(
      `${ORIGIN}/?ref=mail&token_hash=${TOKEN}&type=recovery#view=compact`,
    );
    expect(queryForm).not.toContain(TOKEN);
    expect(new URL(queryForm).searchParams.get("ref")).toBe("mail");
    expect(new URL(queryForm).searchParams.has("token_hash")).toBe(false);
    expect(new URL(queryForm).searchParams.has("type")).toBe(false);
    expect(hashParams(queryForm).get("view")).toBe("compact");
  });

  it("An old-form recovery address (session already in the address) has no token, so it comes back unchanged — as does any other address with no token", () => {
    expect(cleanRecoveryTokenUrl(VERIFIED_HASH)).toBe(VERIFIED_HASH);
    expect(cleanRecoveryTokenUrl(GOOGLE_CALLBACK_HASH)).toBe(GOOGLE_CALLBACK_HASH);
    expect(cleanRecoveryTokenUrl(`${ORIGIN}/?ref=mail#view=compact`)).toBe(
      `${ORIGIN}/?ref=mail#view=compact`,
    );
    expect(cleanRecoveryTokenUrl(PLAIN)).toBe(PLAIN);
  });

  it("An ordinary sign-in callback is neither: a string that is not a valid address has no token, so cleaning it does not throw and hands it back unchanged", () => {
    expect(() => cleanRecoveryTokenUrl("not an address")).not.toThrow();
    expect(cleanRecoveryTokenUrl("not an address")).toBe("not an address");
  });
});

describe("consumeRecoveryToken (the browser wrapper App calls at startup)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("The token is gone from the address bar: consuming returns the token and wipes it from the address (token after `#`)", () => {
    window.history.replaceState(null, "", `/#token_hash=${TOKEN}&type=recovery`);
    expect(consumeRecoveryToken()).toBe(TOKEN);
    expect(window.location.href).not.toContain("token_hash");
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.href).not.toContain("type=recovery");
  });

  it("The token is gone from the address bar: consuming returns the token and wipes it from the address (token in the query string)", () => {
    window.history.replaceState(null, "", `/?token_hash=${TOKEN}&type=recovery`);
    expect(consumeRecoveryToken()).toBe(TOKEN);
    expect(window.location.href).not.toContain("token_hash");
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.href).not.toContain("type=recovery");
  });

  it("The token is gone from the address bar, and the other parameters in the address bar are kept", () => {
    window.history.replaceState(
      null,
      "",
      `/?ref=mail#token_hash=${TOKEN}&type=recovery&view=compact`,
    );
    expect(consumeRecoveryToken()).toBe(TOKEN);
    expect(new URLSearchParams(window.location.search).get("ref")).toBe("mail");
    expect(hashParams(window.location.href).get("view")).toBe("compact");
    expect(window.location.href).not.toContain(TOKEN);
  });

  it("The token is read once: a second read (what a reload of the cleaned address would see) finds no token", () => {
    window.history.replaceState(null, "", `/#token_hash=${TOKEN}&type=recovery`);
    expect(consumeRecoveryToken()).toBe(TOKEN);
    expect(consumeRecoveryToken()).toBeNull();
  });

  it("An old-form recovery address (session already in the address) has no token to consume: `null`, and the address bar is left exactly as it was", () => {
    const oldForm = "/#access_token=aaa.bbb.ccc&refresh_token=rrr&token_type=bearer&type=recovery";
    window.history.replaceState(null, "", oldForm);
    const before = window.location.href;
    expect(consumeRecoveryToken()).toBeNull();
    expect(window.location.href).toBe(before);
  });

  it("An ordinary sign-in callback is neither: on a plain page load there is no token (`null`) and the address bar is untouched", () => {
    window.history.replaceState(null, "", "/?ref=mail");
    const before = window.location.href;
    expect(consumeRecoveryToken()).toBeNull();
    expect(window.location.href).toBe(before);
  });
});
