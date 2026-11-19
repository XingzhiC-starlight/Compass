import { afterAll, describe, expect, it } from "vitest";
import { listArchivedProjects, listProjects } from "./db";
import { signInAsPractice, signOutOfPractice } from "./practiceCopy";

const A_QUIET_SPELL = 35_000;

afterAll(async () => {
  await signOutOfPractice();
});

describe("signing in after the practice copy sat idle", () => {
  it("the seam reads at once, several reads side by side, and none is refused", async () => {
    await new Promise((resolve) => setTimeout(resolve, A_QUIET_SPELL));

    const account = await signInAsPractice("a");
    const [live, archived, again] = await Promise.all([listProjects(), listArchivedProjects(), listProjects()]);

    expect(account.email).toBe("practice-a@compass.test");
    expect([...live, ...archived, ...again].filter((project) => project.userId !== account.id)).toEqual([]);
  }, 60_000);
});
