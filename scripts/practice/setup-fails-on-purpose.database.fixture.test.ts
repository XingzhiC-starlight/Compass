import { beforeAll, describe, expect, it } from "vitest";

describe("kept for proving that a failed setup is reported: the step before the checks fails", () => {
  beforeAll(() => {
    throw new Error("the setup fails on purpose");
  });

  it("never run, one: the step before it failed", () => {
    expect(2 + 2).toBe(4);
  });

  it("never run, two: the step before it failed", () => {
    expect(2 + 2).toBe(4);
  });
});

describe("kept for proving that a failed setup is reported: the step before the checks runs out of time", () => {
  beforeAll(() => new Promise(() => {}), 200);

  it("never run, three: the step before it ran out of time", () => {
    expect(2 + 2).toBe(4);
  });
});

describe("kept for proving that a failed setup is reported: no step before the check", () => {
  it("sound on purpose: runs, in the same file as the checks that do not", () => {
    expect(2 + 2).toBe(4);
  });
});
