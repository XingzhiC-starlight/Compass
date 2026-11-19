import { describe, it, expect } from "vitest";
import { localYMD, todayDate } from "../transforms";

describe("local-day helpers", () => {
  it("localYMD uses the LOCAL calendar day, not UTC", () => {
    expect(localYMD(new Date("2026-06-14T05:00:00.000Z"))).toBe("2026-06-13");
  });

  it("todayDate equals localYMD(now)", () => {
    expect(todayDate()).toBe(localYMD(new Date()));
  });
});
