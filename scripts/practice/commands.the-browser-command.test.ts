// @vitest-environment node

import { describe, expect, it } from "vitest";
import { runBrowserChecks } from "./commands.mjs";
import { PracticeRefusal } from "./lib.mjs";

const SETTINGS = { name: "compass-practice", address: "http://127.0.0.1:55321", inbox: "http://127.0.0.1:55324", app: "http://localhost:5183" };

function surroundings() {
  const said: string[] = [];
  const status = JSON.stringify({ API_URL: SETTINGS.address, INBUCKET_URL: SETTINGS.inbox, PUBLISHABLE_KEY: "sb_publishable_made_up", ANON_KEY: "eyJ.made-up" });
  const around = {
    tool: async (args: string[]) => (args[0] === "status" ? { code: 0, text: status } : { code: 1, text: "" }),
    say: (line: string) => void said.push(line),
    settings: SETTINGS,
    linked: false,
    request: (async () => new Response("{}")) as unknown as typeof fetch,
  };
  return { around, said };
}

function server() {
  let closed = 0;
  return { startServer: async () => ({ close: async () => void (closed += 1) }), closedTimes: () => closed };
}

describe("the browser command, when the runner itself goes wrong", () => {
  it("a runner that cannot run ends in a refusal with its reason, the app closed, nothing said", async () => {
    const { around, said } = surroundings();
    const { startServer, closedTimes } = server();
    const runJourneys = async () => {
      throw new Error("Chromium for the browser checks could not be started: run npx playwright install chromium\nmore");
    };

    const outcome = await runBrowserChecks(around, startServer, runJourneys).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(PracticeRefusal);
    expect((outcome as PracticeRefusal).kind).toBe("tool");
    expect((outcome as Error).message).toBe(
      "The browser checks could not be run: Chromium for the browser checks could not be started: run npx playwright install chromium",
    );
    expect(closedTimes()).toBe(1);
    expect(said).toEqual([]);
  });

  it("a run the runner failed, though every check passed, is not green: one thing not proven", async () => {
    const { around, said } = surroundings();
    const { startServer } = server();
    const runJourneys = async () => ({
      checks: [{ name: "the journey > signs out", file: "browser/the-journey.browser.ts", passed: true, tries: 1, line: 9 }],
      troubles: [],
      runnerFailed: true,
    });

    const answer = await runBrowserChecks(around, startServer, runJourneys);

    expect(answer).toEqual({ passed: false, ran: 1, failed: [], secondTry: [], notProven: [""] });
    expect(said.filter((line) => line.startsWith("not proven"))).toHaveLength(1);
    expect(said[said.length - 1]).toBe("The run did not pass: 1 not proven, and 0 of 1 browser checks that ran failed.");
    expect(said[said.length - 1]).not.toMatch(/passed/);
  });

  it("a check that failed with no picture kept says so on its line", async () => {
    const { around, said } = surroundings();
    const { startServer } = server();
    const runJourneys = async () => ({
      checks: [{ name: "the journey > signs in", file: "browser/the-journey.browser.ts", passed: false, tries: 1, line: 34 }],
      troubles: [],
    });

    await runBrowserChecks(around, startServer, runJourneys);

    expect(said).toEqual([
      "failed      browser/the-journey.browser.ts:34  the journey > signs in — no picture was kept",
      "1 of 1 browser checks failed.",
    ]);
  });
});
