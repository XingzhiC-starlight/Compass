/**
 * How the desktop window is handed the built app (spec §22): from the app's own folder, under
 * an address of its own, with the headers the hosted app had. Pure: no Electron, no disk.
 */

/** The one origin the window ever shows. */
export const APP_ORIGIN = "compass://app";

/** The channel the page's requests for the local database travel on. */
export const DATABASE_CHANNEL = "compass:database";

/**
 * The file under `folder` that an address asks for, or null when the address is not the
 * app's, or names anything outside the folder. `/` is the page itself.
 */
export function fileFor(address: string, folder: string, join: (...parts: string[]) => string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== "compass:" || url.host !== "app") return null;

  let asked: string;
  try {
    asked = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const parts = asked.split("/").filter((part) => part !== "");
  if (parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) return null;
  return parts.length === 0 ? join(folder, "index.html") : join(folder, ...parts);
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
};

export function contentType(file: string): string {
  const ending = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase() ?? "";
  return TYPES[ending] ?? "application/octet-stream";
}

/**
 * The headers every file goes out with. The policy is the hosted app's (spec §17) with every
 * other host taken out: the page may load its own files and nothing else, and may connect to
 * nothing, since its data travels to the main process and not over the network.
 */
export const APP_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** Whether a page at this address may ask for the data: the app's own pages alone. */
export function isTheApp(address: string | undefined | null): boolean {
  return typeof address === "string" && (address === APP_ORIGIN || address.startsWith(`${APP_ORIGIN}/`));
}

/** Whether a link may be handed to the person's browser: a web address and nothing else. */
export function opensInTheBrowser(address: string): boolean {
  try {
    const { protocol } = new URL(address);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
