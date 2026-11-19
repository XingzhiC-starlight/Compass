import { describe, expect, it } from "vitest";
import { captchaSizeForWidth } from "./captchaSize";

const CHECK =
  "At phone width (375px) the compact CAPTCHA is the one asked for; at laptop width (1280px) the normal one";

function boxFor(width: number): string {
  try {
    return String(captchaSizeForWidth(width));
  } catch (error) {
    return `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("the CAPTCHA box that fits the screen", () => {
  it(`${CHECK} — 375px gets "compact"`, () => {
    expect(boxFor(375)).toBe("compact");
  });

  it(`${CHECK} — 1280px gets "normal"`, () => {
    expect(boxFor(1280)).toBe("normal");
  });

  it(`${CHECK} — a phone narrower than 375px is also too narrow for the normal box`, () => {
    expect([320, 360, 375].map(boxFor)).toEqual(["compact", "compact", "compact"]);
  });

  it(`${CHECK} — a screen wider than 1280px also gets the normal box`, () => {
    expect([1280, 1440, 1920].map(boxFor)).toEqual(["normal", "normal", "normal"]);
  });

  it(`${CHECK} — widening the screen from 375px to 1280px switches from compact to normal exactly once, and never back`, () => {
    const answers: string[] = [];
    for (let width = 375; width <= 1280; width += 1) answers.push(boxFor(width));

    expect(Array.from(new Set(answers)).sort()).toEqual(["compact", "normal"]);

    let switches = 0;
    for (let i = 1; i < answers.length; i += 1) {
      if (answers[i] !== answers[i - 1]) switches += 1;
    }
    expect(switches).toBe(1);
  });
});

describe("captchaSizeForWidth — the switching width", () => {
  it("uses the compact box up to 479px and the normal box from 480px", () => {
    expect(captchaSizeForWidth(479)).toBe("compact");
    expect(captchaSizeForWidth(480)).toBe("normal");
  });

  it("gives every common phone width the compact box, large phones included", () => {
    for (const width of [320, 360, 390, 412, 430, 440]) {
      expect(captchaSizeForWidth(width), `${width}px`).toBe("compact");
    }
  });

  it("gives a small tablet (600px) and up the normal box", () => {
    for (const width of [600, 768, 1024]) {
      expect(captchaSizeForWidth(width), `${width}px`).toBe("normal");
    }
  });
});
