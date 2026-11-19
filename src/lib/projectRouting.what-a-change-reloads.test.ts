import { describe, expect, it } from "vitest";
import { dashboardReloadReducer } from "./projectRouting";

describe("dashboardReloadReducer", () => {
  it("counts each failed save as one more quiet-refresh request (a quiet refresh, not a reload)", () => {
    const afterOne = dashboardReloadReducer({ quietRefreshRequest: 0 }, { type: "save-failed" });
    expect(afterOne).toEqual({ quietRefreshRequest: 1 });
    expect(dashboardReloadReducer(afterOne, { type: "save-failed" })).toEqual({
      quietRefreshRequest: 2,
    });
  });
});
