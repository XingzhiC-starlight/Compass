import { describe, expect, it } from "vitest";

const SHARED =
  "made from one line on purpose: a name that begins with a sentence every case of the table shares, and that runs well past the first hundred and twenty characters";

describe("kept for proving that checks made from one line are told apart", () => {
  it.each([
    { which: "the first case", expected: 2 },
    { which: "the second case", expected: 1 },
    { which: "the third case", expected: 2 },
  ])(`${SHARED} — $which`, ({ expected }) => {
    expect(1, "the first and the third are false on purpose").toBe(expected);
  });

  for (const which of ["first", "second"]) {
    it(`short on purpose: the ${which} of two made by a loop`, () => {
      expect(1, "false on purpose").toBe(2);
    });
  }
});
