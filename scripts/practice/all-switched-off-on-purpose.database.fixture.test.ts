import { describe, expect, it } from "vitest";

describe("kept for proving that a run with every check switched off does not pass", () => {
  it.skip("switched off on purpose: the first of two", () => {
    expect(2 + 2).toBe(4);
  });

  it.skip("switched off on purpose: the second of two", () => {
    expect(2 + 2).toBe(4);
  });
});
