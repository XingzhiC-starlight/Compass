import { describe, expect, it } from "vitest";

describe("kept for proving that a run which did not pass is never reported as green", () => {
  it.only("marked as the only one to run: refused on every push, and never run", () => {
    expect(2 + 2).toBe(4);
  });

  it("left unrun, one: the check above was marked as the only one", () => {
    expect(2 + 2).toBe(4);
  });

  it("left unrun, two: the check above was marked as the only one", () => {
    expect(2 + 2).toBe(4);
  });
});
