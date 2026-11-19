import { describe, expect, it } from "vitest";

const SHARED =
  "long on purpose: a name that begins with a sentence every check of this file shares, as a blind test's title begins with its acceptance check, and that runs well past the first hundred and twenty characters";

let triesOfTheUnsteadyCheck = 0;

describe("kept for proving that a long name is cut and still points at one check", () => {
  it(`${SHARED} — the first, false on purpose`, () => {
    expect(1, "false on purpose").toBe(2);
  });

  it(`${SHARED} — the second, false on purpose`, () => {
    expect(1, "false on purpose").toBe(2);
  });

  it(`${SHARED} — the third, unsteady on purpose: fails at its first try and passes at its second`, () => {
    triesOfTheUnsteadyCheck += 1;

    expect(triesOfTheUnsteadyCheck, "the first try fails; the second passes").toBe(2);
  });
});
