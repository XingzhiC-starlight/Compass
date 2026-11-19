function errorText(err: unknown): string {
  if (!(err instanceof Error)) return "";

  const maybeAuthError = err as Error & { code?: unknown; name?: unknown };
  return [maybeAuthError.message, maybeAuthError.code, maybeAuthError.name]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

export function passwordResetErrorMessage(err: unknown): string {
  const msg = errorText(err);
  if (msg.includes("leaked") || msg.includes("breach") || msg.includes("pwned")) {
    return "Use a different password. Avoid common or reused passwords.";
  }
  if (
    msg.includes("same_password") ||
    msg.includes("same password") ||
    msg.includes("different from") ||
    msg.includes("should be different")
  ) {
    return "Choose a new password that is different from your current one.";
  }
  if (msg.includes("password")) {
    return "Use a password that meets all the requirements below.";
  }
  return "Couldn't update your password — the link may have expired. Try again.";
}

export function isUsedOrExpiredLinkError(err: unknown): boolean {
  const msg = errorText(err);
  return msg.includes("otp_expired") || msg.includes("invalid or has expired");
}
