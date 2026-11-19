import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { SaveFailedError, saveInterview } from "../../src/lib/db";
import { TEXT_LIMITS } from "../../src/lib/limits";
import { signInAsPractice, signOutOfPractice } from "../../src/lib/practiceCopy";

describe("kept for proving that a refusal's line is shown when its check fails", () => {
  afterAll(async () => {
    await signOutOfPractice();
  });

  it("refused on purpose, and false on purpose: fails after the database refused a project name one character past its limit", async () => {
    await signInAsPractice("a");

    const refused = await saveInterview({
      setupId: randomUUID(),
      projectName: "x".repeat(TEXT_LIMITS.projectName + 1),
      totalDays: 30,
      hoursPlannedPerDay: 2,
      hoursAvailablePerDay: 4,
      phases: [{ name: "A first phase", estDays: 3 }],
      learn: [{ name: "A first skill", level: 30 }],
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(refused, "the seam passed the refusal on as a failed save").toBeInstanceOf(SaveFailedError);
    expect(1, "false on purpose, after the refusal").toBe(2);
  });
});
