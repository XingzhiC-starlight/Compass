/* ============================================================
   Compass — two database checks kept sound on purpose

   A command that reports a run has to be seen failing a run in which
   every check PASSED and something went wrong outside them: a file that
   could not load, a step before or after a file's checks that failed, an
   error raised outside any check. Otherwise its green proves nothing.

   These two checks are the ones that pass in such a run. They run beside
   one of the four kept files that go wrong on purpose, so that the run
   holds checks that passed and the command still has to fail.

   They are NEVER part of an ordinary run (vitest.config.ts leaves every
   kept file out).

   They run only when asked for: with PRACTICE_FALSE_CHECK=1 around
   the run, as `runDatabaseCommand` does (scripts/practice/cli.mjs).
   ============================================================ */

import { describe, expect, it } from "vitest";
import { getSupabase } from "../../src/lib/supabase";

describe("kept sound, beside a file that goes wrong", () => {
  it("sound on purpose: the practice copy shows a visitor no project", async () => {
    const { data, error } = await getSupabase().from("projects").select("id");

    expect(error, "the practice copy answered").toBeNull();
    expect(data, "what a visitor who is not signed in sees").toEqual([]);
  });

  it("sound on purpose: two and two make four", () => {
    expect(2 + 2).toBe(4);
  });
});
