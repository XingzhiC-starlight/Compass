import { describe, expect, it } from "vitest";
import { projectCardTreeKey, shouldAcceptProjectPayload } from "./dashboardLoad";

describe("shouldAcceptProjectPayload", () => {
  it("accepts matching request id and matching project id", () => {
    expect(shouldAcceptProjectPayload("p1", "p1", 2, 2)).toBe(true);
  });

  it("rejects stale request ids", () => {
    expect(shouldAcceptProjectPayload("p1", "p1", 1, 2)).toBe(false);
  });

  it("rejects payloads for a project that is no longer active", () => {
    expect(shouldAcceptProjectPayload("p1", "p2", 2, 2)).toBe(false);
    expect(shouldAcceptProjectPayload("p1", null, 2, 2)).toBe(false);
  });
});

describe("projectCardTreeKey", () => {
  it("includes active project id and loaded project data version", () => {
    expect(projectCardTreeKey("p1", 3)).toBe("p1:3");
  });

  it("changes after project payload reload for the same project", () => {
    expect(projectCardTreeKey("p1", 3)).not.toBe(projectCardTreeKey("p1", 4));
  });
});
