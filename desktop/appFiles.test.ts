import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_HEADERS, contentType, fileFor, isTheApp, opensInTheBrowser } from "./appFiles";

const CHECK =
  "The desktop window is handed the app's own files and nothing else: an address outside the app's folder finds no file, only the app's page may ask for the data, only a web link leaves for the browser, and the page may load from and connect to nowhere else (spec §22)";

const FOLDER = "/made-up/out/app";
const file = (address: string) => fileFor(address, FOLDER, path.posix.join);

describe("the files the desktop window is handed", () => {
  it(`${CHECK} — the app's address is the page, and a path is the file of that name in the folder`, () => {
    expect(file("compass://app/")).toBe(`${FOLDER}/index.html`);
    expect(file("compass://app")).toBe(`${FOLDER}/index.html`);
    expect(file("compass://app/assets/index-abc.js")).toBe(`${FOLDER}/assets/index-abc.js`);
    expect(file("compass://app/fonts/LexendDeca-Regular.ttf?v=1#x")).toBe(`${FOLDER}/fonts/LexendDeca-Regular.ttf`);
  });

  it.each([
    "compass://app/../main.js",
    "compass://app/assets/../../main.js",
    "compass://app/%2e%2e/main.js",
    "compass://app/assets/%2e%2e%2f%2e%2e%2fmain.js",
    "compass://app/..%5cmain.js",
    "compass://app/a%00b",
    "compass://app/%E0%A4%A",
    "compass://elsewhere/index.html",
    "file:///etc/passwd",
    "https://example.com/",
    "not an address",
  ])(`${CHECK} — %s finds no file outside the folder`, (address) => {
    const found = file(address);
    if (found !== null) expect(found.startsWith(`${FOLDER}/`)).toBe(true);
    if (found !== null) expect(found).not.toContain("..");
    if (!address.startsWith("compass://app")) expect(found).toBeNull();
  });

  it(`${CHECK} — each kind of file goes out as its own type, and an unknown kind as plain bytes`, () => {
    expect(contentType("index.html")).toBe("text/html; charset=utf-8");
    expect(contentType("assets/index-abc.js")).toBe("text/javascript; charset=utf-8");
    expect(contentType("assets/index-abc.css")).toBe("text/css; charset=utf-8");
    expect(contentType("fonts/LexendDeca-Regular.ttf")).toBe("font/ttf");
    expect(contentType("landing/demo.PNG")).toBe("image/png");
    expect(contentType("something.bin")).toBe("application/octet-stream");
    expect(contentType("no-ending")).toBe("application/octet-stream");
  });

  it(`${CHECK} — the policy names no host: its own files, connections to nowhere, no frames, no eval`, () => {
    const policy = APP_HEADERS["Content-Security-Policy"];
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/https?:|\*|unsafe-eval/);
    expect(APP_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it(`${CHECK} — only the app's own page may ask for the data`, () => {
    expect(isTheApp("compass://app/")).toBe(true);
    expect(isTheApp("compass://app")).toBe(true);
    for (const other of ["compass://apple/", "compass://app.example.com/", "https://app/", "file:///x", "", undefined, null]) {
      expect(isTheApp(other), String(other)).toBe(false);
    }
  });

  it(`${CHECK} — a web link opens in the browser, and nothing else is handed to the computer`, () => {
    expect(opensInTheBrowser("https://example.com/a")).toBe(true);
    expect(opensInTheBrowser("http://example.com/")).toBe(true);
    for (const other of ["file:///Applications/Calculator.app", "compass://app/", "javascript:alert(1)", "smb://server/share", "nonsense"]) {
      expect(opensInTheBrowser(other), other).toBe(false);
    }
  });
});
