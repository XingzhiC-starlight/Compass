export type RecoveryLinkKind = "pending" | "verified";

function paramSources(url: URL): URLSearchParams[] {
  return [url.searchParams, new URLSearchParams(url.hash.replace(/^#/, ""))];
}

function parse(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

export function classifyRecoveryLink(rawUrl: string): RecoveryLinkKind | null {
  const url = parse(rawUrl);
  if (!url) return null;

  const sources = paramSources(url);
  const marked = sources.some(
    (params) => params.get("type") === "recovery" || params.get("redirect_type") === "recovery",
  );
  if (!marked) return null;
  return sources.some((params) => params.get("token_hash")) ? "pending" : "verified";
}

export function recoveryTokenHash(rawUrl: string): string | null {
  if (classifyRecoveryLink(rawUrl) !== "pending") return null;
  const url = parse(rawUrl);
  if (!url) return null;
  for (const params of paramSources(url)) {
    const token = params.get("token_hash");
    if (token) return token;
  }
  return null;
}

export function cleanRecoveryTokenUrl(rawUrl: string): string {
  if (classifyRecoveryLink(rawUrl) !== "pending") return rawUrl;
  const url = parse(rawUrl);
  if (!url) return rawUrl;

  for (const key of ["token_hash", "type"]) url.searchParams.delete(key);

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  for (const key of ["token_hash", "type"]) hashParams.delete(key);
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";

  return url.toString();
}

export function consumeRecoveryToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = recoveryTokenHash(window.location.href);
  if (!token) return null;

  const cleaned = new URL(cleanRecoveryTokenUrl(window.location.href));
  window.history.replaceState(
    window.history.state,
    document.title,
    `${cleaned.pathname}${cleaned.search}${cleaned.hash}`,
  );
  return token;
}
