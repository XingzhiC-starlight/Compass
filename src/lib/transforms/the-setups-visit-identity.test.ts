import { describe, it, expect } from "vitest";
import { randomId } from "../transforms";

describe("randomId (the setup screen's visit identity)", () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("is a lowercase version-4 UUID, as the database's uuid column accepts", () => {
    for (let i = 0; i < 200; i += 1) expect(randomId()).toMatch(UUID_V4);
  });

  it("is new every call", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => randomId()));
    expect(seen.size).toBe(1000);
  });

  it("needs only crypto.getRandomValues, not crypto.randomUUID (iOS before 15.4)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    try {
      expect(randomId()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true, writable: true });
    }
  });
});
