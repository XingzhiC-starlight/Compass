import { describe, expect, it } from "vitest";

describe("kept for proving that a switched-off check is said", () => {
  it("runs on purpose: two and two make four", () => {
    expect(2 + 2).toBe(4);
  });

  it.skip("switched off on purpose: a check that is switched off in its file does not run, is named on a line of its own, and is counted in the closing line", () => {
    expect(2 + 2).toBe(5);
  });

  it.todo("not yet written on purpose: a check that someone means to write");
});
