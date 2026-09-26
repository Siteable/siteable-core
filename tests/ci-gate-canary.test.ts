import { describe, it, expect } from "vitest";

// Deliberate failing canary — verifies a failing required status check
// blocks merge on main (SC-002). Removed after verification.
describe("SC-002 negative canary", () => {
  it("deliberately fails to verify the merge gate", () => {
    expect(1).toBe(2);
  });
});
