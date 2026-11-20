import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../lib/types";
import Sidebar from "../Sidebar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("__APP_VERSION__", "0.0.0-test");

const CHECK =
  "Settings offers what the copy has: with accounts, the privacy notice and Log out, which signs out and tells the gate; with the data kept on this device, one line saying so and neither of the two (spec §14)";

const seam = vi.hoisted(() => ({ onThisDevice: false, signOuts: 0 }));
vi.mock("../../lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/db")>();
  return {
    ...real,
    storesOnThisDevice: () => seam.onThisDevice,
    signOut: async () => {
      seam.signOuts += 1;
    },
  };
});

const PROJECT: Project = {
  id: "p1",
  userId: "u1",
  name: "Lighthouse",
  accentColor: "#9A7B4F",
  sortOrder: 0,
  archivedAt: null,
  totalDays: 90,
  hoursPlannedPerDay: 4,
  hoursAvailablePerDay: 6,
  startedAt: "2026-07-21",
  createdAt: "2026-07-21T17:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root | null = null;

async function openSettings(onSignOut = vi.fn()): Promise<Element> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Sidebar
        projects={[PROJECT]}
        archived={[]}
        finishedIds={new Set()}
        activeProjectId="p1"
        onRenamed={vi.fn()}
        onReorderProjects={vi.fn()}
        onSelectProject={vi.fn()}
        onNewProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onUnarchiveProject={vi.fn()}
        onSignOut={onSignOut}
        onOpenCompanion={vi.fn()}
        companionOpen={false}
      />,
    );
  });
  await act(async () => {
    container.querySelector<HTMLButtonElement>(".sidebar-settings")!.click();
  });
  const panel = container.querySelector(".settings-panel");
  if (!panel) throw new Error("the Settings dialog did not open");
  return panel;
}

const words = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  seam.onThisDevice = false;
  seam.signOuts = 0;
});

describe("what Settings offers", () => {
  it(`${CHECK} — with accounts: the privacy notice, a divider, Log out and the version`, async () => {
    const onSignOut = vi.fn();
    const panel = await openSettings(onSignOut);

    expect(panel.querySelector('a.settings-row[href="/privacy.html"]')).not.toBeNull();
    expect(panel.querySelector(".settings-divider")).not.toBeNull();
    expect(words(panel)).toContain("Version 0.0.0-test");
    expect(words(panel)).not.toContain("Saved on this device");

    const logOut = panel.querySelector<HTMLButtonElement>("button.settings-row");
    expect(words(logOut!)).toBe("Log outSign out from your account");
    await act(async () => {
      logOut!.click();
    });
    expect(seam.signOuts).toBe(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".settings-panel"), "the dialog closed").toBeNull();
  });

  it(`${CHECK} — on this device: the one line and the version, and nothing to press but the close button`, async () => {
    seam.onThisDevice = true;
    const panel = await openSettings();

    expect(words(panel)).toBe("SettingsSaved on this deviceNo account. Your work stays on this device.Version 0.0.0-test");
    expect(panel.querySelector(".settings-row, .settings-divider, a")).toBeNull();
    expect(Array.from(panel.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))).toEqual(["Close settings"]);
  });
});
