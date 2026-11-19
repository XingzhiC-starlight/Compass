import { describe, expect, it } from "vitest";

throw new Error("cannot load on purpose");

describe("kept for proving that a file which cannot load is reported", () => {
  it("never found: the file raised an error before the test runner read this far", () => {
    expect(2 + 2).toBe(4);
  });
});
