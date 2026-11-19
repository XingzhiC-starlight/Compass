import { afterAll, describe, expect, it } from "vitest";

describe("kept for proving that a check which switched itself off is not counted as left unrun", () => {
  afterAll(() => {
    throw new Error("the step after fails on purpose");
  });

  it("runs on purpose: two and two make four", () => {
    expect(2 + 2).toBe(4);
  });

  it("switches itself off on purpose, before the step after it fails", (context) => {
    context.skip();
  });
});
