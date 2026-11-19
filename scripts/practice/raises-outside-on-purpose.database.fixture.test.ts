import { describe, expect, it } from "vitest";

describe("kept for proving that an error raised outside any check is reported", () => {
  it("sound on purpose: passes, and leaves behind something that goes wrong later", () => {
    void new Promise((_, refuse) => {
      setTimeout(() => refuse(new Error("raised outside any check, on purpose")), 20);
    });

    expect(2 + 2).toBe(4);
  });

  it("sound on purpose: passes, while what the first check left behind goes wrong", async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(2 + 2).toBe(4);
  });
});
