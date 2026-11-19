import { describe, expect, it } from "vitest";
import { getSupabase } from "../../src/lib/supabase";

let triesOfTheUnsteadyCheck = 0;

describe("kept for proving that a failure is reported", () => {
  it("false on purpose: expects a project that was never saved", async () => {
    const { data, error } = await getSupabase().from("projects").select("id");

    expect(error, "the practice copy answered").toBeNull();
    expect(data?.length, "a project that was never saved").toBe(1);
  });

  it("unsteady on purpose: fails at its first try and passes at its second", () => {
    triesOfTheUnsteadyCheck += 1;

    expect(triesOfTheUnsteadyCheck, "the first try fails; the second passes").toBe(2);
  });
});
