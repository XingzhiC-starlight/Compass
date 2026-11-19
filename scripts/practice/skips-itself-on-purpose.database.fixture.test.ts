import { describe, expect, it } from "vitest";

describe("kept for proving that a check which switches itself off is said", () => {
  it("runs on purpose: two and two make four", () => {
    expect(2 + 2).toBe(4);
  });

  it("switches itself off on purpose: begins, and decides as it runs that it does not apply", (context) => {
    context.skip();
  });
});
