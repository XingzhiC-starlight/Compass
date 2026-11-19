// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import settings from "../../browser/playwright.config";
import { openResetLink } from "../../browser/helpers";

describe("what the browser runner is allowed to keep", () => {
  it("keeps no trace, for any check", () => {
    expect(settings.use?.trace).toBe("off");
    for (const project of settings.projects ?? []) {
      expect(project.use?.trace ?? "off").toBe("off");
    }
  });

  it("keeps a picture and a recording only for a check that failed", () => {
    expect(settings.use?.screenshot).toBe("only-on-failure");
    expect(settings.use?.video).toBe("retain-on-failure");
    for (const project of settings.projects ?? []) {
      expect(project.use?.screenshot ?? "only-on-failure").toBe("only-on-failure");
      expect(project.use?.video ?? "retain-on-failure").toBe("retain-on-failure");
    }
  });

  it("tries a failed check again only when the command asks", () => {
    expect(settings.retries).toBe(0);
    for (const project of settings.projects ?? []) {
      expect(project.retries ?? 0).toBe(0);
    }
  });

  it("reports a reset link it cannot open without the link", async () => {
    const link = "http://localhost:5183/#access_token=made-up-one-time-token&type=recovery";
    const page = {
      goto: async (address: string) => {
        if (address === "about:blank") return null;
        throw new Error(`page.goto: net::ERR_CONNECTION_REFUSED at ${address}`);
      },
    } as unknown as Page;

    const outcome = await openResetLink(page, link).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    const message = (outcome as Error).message;
    expect(message).toBe("The browser could not open the reset link.");
    expect(message).not.toContain("made-up-one-time-token");
    expect(String((outcome as Error).stack)).not.toContain("made-up-one-time-token");
    expect((outcome as Error).cause).toBeUndefined();
  });
});
