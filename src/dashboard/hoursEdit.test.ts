import { describe, expect, it } from "vitest";
import { parseHoursEdit } from "./hoursEdit";

const CHECK_LOOK =
  'Open a past day whose hours are not a whole tenth, such as 2 hours 32 minutes, and click away without typing: nothing is written, and the row still shows "2.5h"';
const CHECK_TYPED =
  "Open a past day, type a different value and press Enter or click away: the day's stored total becomes the entered hours × 3600 seconds, and the row shows the entered hours";
const CHECK_INVALID =
  "Open a past day, clear the field, or type letters, or a negative number, then leave: nothing is written and the row shows its previous hours";

const CONTROL =
  "(control) a real change — 3 typed over 2.5 — is still handed back, so the nothing above is a decision, not a rule that stores nothing at all";

function decide(opened: string, typed: string): number | null | string {
  try {
    return parseHoursEdit(opened, typed);
  } catch (error) {
    return `the rule threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("the hours-edit rule (src/dashboard/hoursEdit)", () => {
  it(`${CHECK_LOOK} — the rule behind it: the text the editor opened with, handed back untouched or retyped, means nothing to store`, () => {
    expect(decide("2.5", "2.5"), '"2.5" opened, "2.5" closed').toBeNull();
    expect(decide("4", "4"), '"4" opened, "4" closed').toBeNull();
    expect(decide("0.5", "0.5"), '"0.5" opened, "0.5" retyped').toBeNull();
    expect(decide("2.5", "3"), CONTROL).toBe(3);
  });

  it(`${CHECK_TYPED} — the rule hands back the typed hours exactly as entered, for the caller to store as hours × 3600`, () => {
    expect(decide("2.5", "3"), '"3" typed over "2.5"').toBe(3);
    expect(decide("2.5", "0.5"), '"0.5" typed over "2.5"').toBe(0.5);
    expect(decide("2.5", "2.75"), '"2.75" typed over "2.5" — kept, not rounded to a tenth').toBe(2.75);
    expect(decide("4", "1.25"), '"1.25" typed over "4" — kept, not rounded to a tenth').toBe(1.25);
    expect(decide("2.5", "0"), '"0" typed over "2.5"').toBe(0);
  });

  it(`${CHECK_TYPED} — "different" is judged by the text (Constraints): "2.50" typed over "2.5" is an edit and hands back 2.5`, () => {
    expect(decide("2.5", "2.50"), '"2.50" typed over "2.5"').toBe(2.5);
    expect(decide("4", "4.0"), '"4.0" typed over "4"').toBe(4);
  });

  it(`${CHECK_INVALID} — the rule: a cleared field means nothing to store`, () => {
    expect(decide("2.5", ""), "the field cleared").toBeNull();
    expect(decide("2.5", "   "), "the field holding only spaces — empty, as a person sees it").toBeNull();
    expect(decide("2.5", "3"), CONTROL).toBe(3);
  });

  it(`${CHECK_INVALID} — the rule: letters mean nothing to store`, () => {
    expect(decide("2.5", "abc"), '"abc" typed').toBeNull();
    expect(decide("2.5", "two"), '"two" typed').toBeNull();
    expect(decide("2.5", "2h"), '"2h" typed — not a number').toBeNull();
    expect(decide("2.5", "3"), CONTROL).toBe(3);
  });

  it(`${CHECK_INVALID} — the rule: a negative number means nothing to store`, () => {
    expect(decide("2.5", "-1"), '"-1" typed').toBeNull();
    expect(decide("2.5", "-0.5"), '"-0.5" typed').toBeNull();
    expect(decide("2.5", "3"), CONTROL).toBe(3);
  });
});

describe("parseHoursEdit — the edges of what counts as a number", () => {
  it("accepts the plain decimal shapes a person types", () => {
    expect(parseHoursEdit("2.5", ".5")).toBe(0.5);
    expect(parseHoursEdit("2.5", "2.")).toBe(2);
    expect(parseHoursEdit("2.5", "07")).toBe(7);
    expect(parseHoursEdit("2.5", "12.25")).toBe(12.25);
  });

  it("ignores surrounding spaces: ' 3 ' stores 3, and ' 2.5 ' over '2.5' is a look, not an edit", () => {
    expect(parseHoursEdit("2.5", " 3 ")).toBe(3);
    expect(parseHoursEdit("2.5", " 2.5 ")).toBeNull();
  });

  it("refuses number-like text that is not a plain decimal (the owner's choice, 2026-09-22)", () => {
    for (const typed of ["+2", "-0", "1e3", "0x10", "1,5", "Infinity", "NaN", "2h", "2 h", "1.2.3", "."]) {
      expect(parseHoursEdit("2.5", typed), JSON.stringify(typed)).toBeNull();
    }
  });
});
