import { describe, expect, it } from "vitest";
import {
  CARD_RECTS,
  FRAMES,
  TOGGLE_RECTS,
  cardRectStyle,
  frameKey,
  toggleRectStyle,
  type FrameKey,
} from "./landingDemo";

const ALL_KEYS: FrameKey[] = ["stk", "dtk", "sth", "dth"];

describe("frameKey", () => {
  it("maps every (depth, thoughts) pair to its own frame", () => {
    expect(frameKey(false, false)).toBe("stk");
    expect(frameKey(true, false)).toBe("dtk");
    expect(frameKey(false, true)).toBe("sth");
    expect(frameKey(true, true)).toBe("dth");
  });
});

describe("cardRectStyle", () => {
  it("converts measured edges into positioned % styles without float noise", () => {
    expect(cardRectStyle([20.02, 5.58, 44.21, 29.07])).toEqual({
      left: "20.02%",
      top: "5.58%",
      width: "24.19%",
      height: "23.49%",
    });
  });
});

describe("toggleRectStyle", () => {
  it("passes the measured width/height through unchanged", () => {
    expect(toggleRectStyle([89.3, 35.4, 4.1, 2.9])).toEqual({
      left: "89.3%",
      top: "35.4%",
      width: "4.1%",
      height: "2.9%",
    });
  });
});

describe("measured demo data", () => {
  it("has three in-bounds card rects per frame, with right>left and bottom>top", () => {
    for (const key of ALL_KEYS) {
      expect(CARD_RECTS[key]).toHaveLength(3);
      for (const [left, top, right, bottom] of CARD_RECTS[key]) {
        for (const v of [left, top, right, bottom]) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(100);
        }
        expect(right).toBeGreaterThan(left);
        expect(bottom).toBeGreaterThan(top);
      }
    }
  });

  it("has an in-bounds toggle rect with positive size in every frame", () => {
    for (const key of ALL_KEYS) {
      const [left, top, width, height] = TOGGLE_RECTS[key];
      expect(left).toBeGreaterThan(0);
      expect(top).toBeGreaterThan(0);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(left + width).toBeLessThan(100);
      expect(top + height).toBeLessThan(100);
    }
  });

  it("points each frame at its own image under /landing/demo/", () => {
    const srcs = ALL_KEYS.map((key) => FRAMES[key].src);
    expect(new Set(srcs).size).toBe(4);
    for (const src of srcs) {
      expect(src.startsWith("/landing/demo/frame-")).toBe(true);
      expect(src.endsWith(".png")).toBe(true);
    }
  });
});
