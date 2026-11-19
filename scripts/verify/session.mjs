#!/usr/bin/env node
// The browser session that `verify.mjs launch` starts and the interactive commands drive: one
// Chromium page at the practice app, kept open between commands, answering on 127.0.0.1 only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import { APP, handAccount, practiceCopy, withoutColour } from "./lib.mjs";
import { expect, guardedContext, makeHelpers } from "./journey.mjs";
import { landingLogIn } from "./screens.mjs";

const dir = process.argv[2];
const headed = process.argv.includes("--headed");
if (!dir || !fs.existsSync(path.join(dir, "run.json"))) {
  console.error("Usage: node scripts/verify/session.mjs <run folder> [--headed]");
  process.exit(2);
}
const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
const evidence = path.join(dir, "interactive");
fs.mkdirSync(evidence, { recursive: true });

const browser = await chromium.launch({ headless: !headed });
const refused = [];
const seen = new Set();
const consoleLines = [];
const where = await practiceCopy();
const j = { run, dir: evidence, where, browser, refused, contextOptions: {}, expect, state: {}, console: consoleLines, pages: [], videos: [] };
Object.assign(j, makeHelpers(j));
j.context = await guardedContext(browser, refused);
j.context.on("request", (request) => {
  try {
    seen.add(new URL(request.url()).origin);
  } catch {
    /* no origin */
  }
});

function watch(page) {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleLines.push(`${message.type()}: ${message.text().slice(0, 500)}`);
  });
  page.on("pageerror", (error) => consoleLines.push(`uncaught: ${String(error?.message ?? error).slice(0, 500)}`));
}
j.page = await j.context.newPage();
watch(j.page);
j.page.setDefaultTimeout(10_000);
await j.page.goto(APP);
await expect(landingLogIn(j.page)).toBeVisible({ timeout: 60_000 });

let counter = 0;
function nextName(command) {
  counter += 1;
  return path.join(evidence, `${String(counter).padStart(3, "0")}-${command}`);
}

function locate(target) {
  if (!target || typeof target !== "object") throw new Error("Name what to act on.");
  const scope = target.in ? j.page.locator(target.in) : j.page;
  const exact = target.exact === true;
  let found;
  if (target.role) found = scope.getByRole(target.role, target.name !== undefined ? { name: target.name, exact } : {});
  else if (target.placeholder) found = scope.getByPlaceholder(target.placeholder, { exact });
  else if (target.label) found = scope.getByLabel(target.label, { exact });
  else if (target.title) found = scope.getByTitle(target.title, { exact });
  else if (target.text) found = scope.getByText(target.text, { exact });
  else if (target.css) found = scope.locator(target.css);
  else if (target.in) found = scope;
  else throw new Error("Name what to act on: --role (with --name), --placeholder, --label, --title, --text or --css, and --in <css> to look inside one part of the page.");
  return target.nth !== undefined ? found.nth(Number(target.nth)) : found;
}

async function picture(command) {
  const base = nextName(command);
  await j.page.screenshot({ path: `${base}.png` });
  return `${base}.png`;
}

function account(email) {
  const chosen = handAccount(run, email);
  if (!chosen) throw new Error(email ? `${email} is not one of this run's accounts.` : "This run has no account to drive by hand yet: run `node scripts/verify/verify.mjs account` first.");
  return chosen;
}

const ACTIONS = {
  async open({ path: pathname = "/" }) {
    await j.open(pathname);
    return [`opened ${new URL(j.page.url()).pathname}`];
  },
  async reload() {
    await j.page.reload();
    return ["reloaded"];
  },
  async click({ target, modifiers }) {
    await locate(target).click(modifiers ? { modifiers } : {});
    return ["clicked"];
  },
  async fill({ target, value }) {
    await locate(target).fill(String(value ?? ""));
    return ["filled"];
  },
  async type({ target, value }) {
    if (target) await locate(target).pressSequentially(String(value ?? ""));
    else await j.page.keyboard.type(String(value ?? ""));
    return ["typed"];
  },
  async press({ target, keys }) {
    for (const key of String(keys).split(/\s+/).filter(Boolean)) {
      if (target) await locate(target).press(key);
      else await j.page.keyboard.press(key);
    }
    return [`pressed ${keys}`];
  },
  async select({ target, value }) {
    await locate(target).selectOption(String(value));
    return [`selected ${value}`];
  },
  async check({ target }) {
    await locate(target).check();
    return ["checked"];
  },
  async uncheck({ target }) {
    await locate(target).uncheck();
    return ["unchecked"];
  },
  async hover({ target }) {
    await locate(target).hover();
    return ["hovering"];
  },
  async drag({ target, to, position = "top" }) {
    const destination = locate(to);
    const box = await destination.boundingBox();
    if (!box) throw new Error("The place to drop on is not on screen.");
    await locate(target).dragTo(destination, { targetPosition: { x: box.width / 2, y: position === "bottom" ? box.height - 3 : 3 } });
    return [`dragged onto the ${position} of the target`];
  },
  async "sign-in"({ email }) {
    const chosen = account(email);
    await j.signIn(chosen);
    return [`signed in as ${chosen.email}`];
  },
  async setup({ name = "Compass verify" }) {
    await j.setUp(name);
    return [`set up "${name}" and opened its dashboard`];
  },
  async viewport({ width, height }) {
    await j.page.setViewportSize({ width: Number(width), height: Number(height) });
    return [`viewport ${width}×${height}`];
  },
  async motion({ value }) {
    await j.page.emulateMedia({ reducedMotion: value === "reduce" ? "reduce" : "no-preference" });
    return [`prefers-reduced-motion: ${value === "reduce" ? "reduce" : "no-preference"}`];
  },
};

const READS = {
  async see({ target }) {
    await expect(locate(target)).toBeVisible();
    return ["visible"];
  },
  async gone({ target }) {
    await expect(locate(target)).toHaveCount(0);
    return ["not on the page"];
  },
  async count({ target }) {
    return [String(await locate(target).count())];
  },
  async text({ target }) {
    const texts = await locate(target).allTextContents();
    return texts.length === 0 ? ["(nothing matches)"] : texts.map((text) => text.replace(/\s+/g, " ").trim());
  },
  async value({ target }) {
    const held = await locate(target).inputValue();
    return [`${held.length} characters: ${held.length > 200 ? `${held.slice(0, 200)}…` : held}`];
  },
  async focused() {
    const about = await j.page.evaluate(() => {
      const el = globalThis.document.activeElement;
      if (!el || el === globalThis.document.body) return "nothing has focus (the page body)";
      const name = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent?.trim().slice(0, 80) || "";
      return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}${name ? ` "${name}"` : ""}`;
    });
    return [about];
  },
  async url() {
    const at = new URL(j.page.url());
    return [`${at.pathname}${at.search}${at.hash}`];
  },
  async snapshot({ in: within }) {
    const base = nextName("snapshot");
    const outline = await (within ? j.page.locator(within) : j.page.locator("body")).ariaSnapshot();
    fs.writeFileSync(`${base}.aria.yml`, `${outline}\n`);
    return [...outline.split("\n"), `saved ${path.relative(dir, `${base}.aria.yml`)}`];
  },
  async shot({ full }) {
    const base = nextName("shot");
    await j.page.screenshot({ path: `${base}.png`, fullPage: full === true });
    const outline = await j.page.locator("body").ariaSnapshot().catch(() => "");
    if (outline) fs.writeFileSync(`${base}.aria.yml`, `${outline}\n`);
    return [`saved ${path.relative(dir, `${base}.png`)}`];
  },
  async console({ clear }) {
    const lines = consoleLines.length === 0 ? ["no error or warning was printed"] : [...consoleLines];
    if (clear) consoleLines.length = 0;
    return lines;
  },
  async requests() {
    return [
      `reached: ${[...seen].sort().join(", ") || "nothing yet"}`,
      `refused: ${[...new Set(refused)].join(", ") || "nothing"}`,
    ];
  },
  async wait({ ms }) {
    await j.page.waitForTimeout(Math.min(Number(ms) || 0, 30_000));
    return [`waited ${ms} ms`];
  },
};

async function answer(command, args) {
  if (ACTIONS[command]) {
    const lines = await ACTIONS[command](args);
    const saved = await picture(command);
    return [...lines, `picture ${path.relative(dir, saved)}`];
  }
  if (READS[command]) return READS[command](args);
  throw new Error(`The session has no command "${command}".`);
}

let queue = Promise.resolve();
async function close() {
  try {
    await browser.close();
  } finally {
    fs.rmSync(path.join(dir, "session.json"), { force: true });
    process.exit(0);
  }
}

const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    queue = queue.then(async () => {
      let reply;
      try {
        const { command, args } = JSON.parse(body || "{}");
        if (command === "close") {
          response.end(JSON.stringify({ ok: true, lines: ["the browser session is closing"] }));
          setTimeout(close, 50);
          return;
        }
        reply = { ok: true, lines: await answer(command, args ?? {}) };
      } catch (error) {
        reply = { ok: false, error: withoutColour(error?.message ?? error).split("\n").slice(0, 8).join("\n") };
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(reply));
    });
  });
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  fs.writeFileSync(path.join(dir, "session.json"), `${JSON.stringify({ pid: process.pid, port, headed }, null, 2)}\n`);
});

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, close);
