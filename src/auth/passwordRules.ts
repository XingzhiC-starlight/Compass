export const MIN_PASSWORD_LENGTH = 8;

export type PasswordRuleId =
  | "length"
  | "lowercase"
  | "uppercase"
  | "number"
  | "special"
  | "match";

export type PasswordRuleResult = {
  id: PasswordRuleId;
  label: string;
  met: boolean;
};

export function getPasswordRuleResults(
  password: string,
  confirmation: string,
): PasswordRuleResult[] {
  return [
    {
      id: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: "lowercase",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      id: "uppercase",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "number",
      label: "One number",
      met: /\d/.test(password),
    },
    {
      id: "special",
      label: "One special character",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
    {
      id: "match",
      label: "Passwords match",
      met: password.length > 0 && password === confirmation,
    },
  ];
}

export function validatePasswordPair(password: string, confirmation: string): string | null {
  const missingRule = getPasswordRuleResults(password, confirmation).find((rule) => !rule.met);
  if (!missingRule) return null;
  if (missingRule.id === "match") return "Enter the same password twice.";
  return "Use a password that meets all the requirements below.";
}
