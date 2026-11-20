import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHECK =
  "With no Supabase project configured, Compass opens with no sign-in and keeps its data on this device: a first open shows the setup and never the landing page or the login form; a saved project opens on its dashboard again after a reload; and Settings says the work is saved on this device and offers no log out";

// Nothing is replaced here: the app, the seam, the client module and the local database are
// the real ones, on jsdom's storage. The suite's env holds no Supabase address (vitest.config.ts).

const SETUP = {
  setupId: "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
  projectName: "Garden",
  totalDays: 30,
  hoursPlannedPerDay: 2,
  hoursAvailablePerDay: 3,
  phases: [{ name: "Dig the beds", estDays: 3 }],
  learn: [{ name: "Soil", level: 10 }],
};

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function waitFor(check: () => boolean, ms = 5000, step = 50): Promise<boolean> {
  await settle();
  let waited = 0;
  while (!check() && waited < ms) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(step);
    });
    waited += step;
  }
  return check();
}

function shown(): string {
  const copy = container.cloneNode(true) as Element;
  copy.querySelectorAll("input, textarea, select").forEach((field) => field.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}
const onSetup = () => container.querySelector(".setup") !== null;
const onDashboard = () => container.querySelector(".sidebar") !== null && container.querySelector(".bubble-time") !== null;

/** A page load: fresh modules, so the seam and its client start as they do when the page opens. */
async function open(): Promise<typeof import("../lib/db")> {
  vi.resetModules();
  const db = await import("../lib/db");
  const { default: App } = await import("../App");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<App />);
  });
  const ready = await waitFor(() => onSetup() || onDashboard());
  expect(ready, `the app opened on the setup or the dashboard (screen: ${shown().slice(0, 200)})`).toBe(true);
  return db;
}

async function close(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
}

function press(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error("nothing to press");
  return act(async () => {
    (el as HTMLElement).click();
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal("__APP_VERSION__", "0.0.0-test");
  window.localStorage.clear();
});
afterEach(async () => {
  await close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.localStorage.clear();
});

describe("a copy of Compass with no accounts", () => {
  it(`${CHECK} — a first open shows the setup, with no landing page and no login form`, async () => {
    const db = await open();
    expect(db.storesOnThisDevice()).toBe(true);
    expect(onSetup()).toBe(true);
    expect(container.querySelector('input[placeholder="Name this project"]')).not.toBeNull();
    expect(shown()).not.toMatch(/Log in|Sign in|Continue with Google/);
    expect(shown(), 'a first open has nothing to go back to').not.toContain("← Back");
  });

  it.each([
    ["a reset link's token", "/?token_hash=made-up-token&type=recovery"],
    ["a recovery session", "/#type=recovery"],
    ["a failed sign-in", "/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"],
  ])(`${CHECK} — an address shaped like %s opens the setup too, never the recovery or the login screen`, async (_what, address) => {
    window.history.replaceState(null, "", address);
    try {
      await open();
      expect(onSetup()).toBe(true);
      expect(shown()).not.toMatch(/new password|Log in|Sign in|Continue with Google/i);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it(`${CHECK} — a saved project opens on its dashboard, and again after the page is closed and opened`, async () => {
    const db = await open();
    await act(async () => {
      await db.saveInterview(SETUP);
    });
    await close();

    await open();
    expect(await waitFor(onDashboard)).toBe(true);
    expect(shown()).toContain("Garden");
    expect(shown()).toContain("Dig the beds");

    await close();
    await open();
    expect(await waitFor(onDashboard), "the same project is there after another open").toBe(true);
    expect(container.querySelectorAll(".project-pill .pill-name")).toHaveLength(1);
    expect(shown()).toContain("Garden");
  });

  it(`${CHECK} — Settings says the work is saved on this device, and offers no log out and no privacy notice of the hosted service`, async () => {
    const db = await open();
    await act(async () => {
      await db.saveInterview(SETUP);
    });
    await close();
    await open();
    expect(await waitFor(onDashboard)).toBe(true);

    await press(container.querySelector(".sidebar-settings"));
    const panel = container.querySelector(".settings-panel");
    expect(panel, "the Settings dialog opened").not.toBeNull();
    const words = (panel?.textContent ?? "").replace(/\s+/g, " ");
    expect(words).toContain("Saved on this device");
    expect(words).toContain("No account. Your work stays on this device.");
    expect(words).toMatch(/Version \d/);
    expect(words).not.toMatch(/Log out|Privacy Notice/);
    expect(panel?.querySelector("a, .settings-row")).toBeNull();
  });
});
