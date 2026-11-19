import { afterAll, describe, expect, it } from "vitest";

describe("kept for proving that a failed teardown is reported", () => {
  afterAll(() => {
    throw new Error("the teardown fails on purpose");
  });

  it("sound on purpose: passes, before the step after it fails", () => {
    expect(2 + 2).toBe(4);
  });
});
