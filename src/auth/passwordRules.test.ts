import { describe, expect, it } from "vitest";
import { getPasswordRuleResults, validatePasswordPair } from "./passwordRules";

function metIds(password: string, confirmation: string) {
  return getPasswordRuleResults(password, confirmation)
    .filter((rule) => rule.met)
    .map((rule) => rule.id);
}

describe("passwordRules", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(metIds("Aa1", "Aa1")).not.toContain("length");
    expect(validatePasswordPair("Aa1", "Aa1")).toBe(
      "Use a password that meets all the requirements below.",
    );
  });

  it("requires a lowercase letter", () => {
    expect(metIds("PASSWORD1", "PASSWORD1")).not.toContain("lowercase");
  });

  it("requires an uppercase letter", () => {
    expect(metIds("password1", "password1")).not.toContain("uppercase");
  });

  it("requires a number", () => {
    expect(metIds("Password", "Password")).not.toContain("number");
  });

  it("requires a special character", () => {
    expect(metIds("Password1", "Password1")).not.toContain("special");
    expect(validatePasswordPair("Password1", "Password1")).toBe(
      "Use a password that meets all the requirements below.",
    );
  });

  it("rejects mismatched confirmation", () => {
    expect(metIds("Password1!", "Password2!")).not.toContain("match");
    expect(validatePasswordPair("Password1!", "Password2!")).toBe("Enter the same password twice.");
  });

  it("accepts a valid matching password", () => {
    expect(validatePasswordPair("Password1!", "Password1!")).toBeNull();
    expect(metIds("Password1!", "Password1!")).toEqual([
      "length",
      "lowercase",
      "uppercase",
      "number",
      "special",
      "match",
    ]);
  });
});
