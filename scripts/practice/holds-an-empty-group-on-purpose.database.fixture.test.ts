import { describe, expect, it } from "vitest";

describe("kept beside an empty group", () => {
  it("runs on purpose: two and two make four", () => {
    expect(2 + 2).toBe(4);
  });
});

describe("kept empty on purpose", () => {});
