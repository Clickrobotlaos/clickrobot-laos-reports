import { describe, expect, it } from "vitest";
import { DecisionInput, GuardianRequestInput } from "@/lib/cr360/schemas";

describe("parent request contract (0009)", () => {
  const base = { studentCode: "TST-001", kind: "absence", startDate: "2026-11-20", message: "family trip" };
  it("absence/extension need a start date; makeup/other do not", () => {
    expect(GuardianRequestInput.safeParse(base).success).toBe(true);
    expect(GuardianRequestInput.safeParse({ ...base, startDate: undefined }).success).toBe(false);
    expect(GuardianRequestInput.safeParse({ studentCode: "TST-001", kind: "makeup", message: "Saturday?" }).success).toBe(true);
  });
  it("rejects backwards ranges, unknown kinds and ownership fields", () => {
    expect(GuardianRequestInput.safeParse({ ...base, endDate: "2026-11-19" }).success).toBe(false);
    expect(GuardianRequestInput.safeParse({ ...base, kind: "refund" }).success).toBe(false);
    expect(GuardianRequestInput.safeParse({ ...base, guardianUserId: "x" }).success).toBe(false);
    expect(GuardianRequestInput.safeParse({ ...base, status: "approved" }).success).toBe(false);
  });
  it("managers decide parent requests through the shared decision contract", () => {
    const id = "60000000-0000-4000-8000-0000000000a2";
    expect(DecisionInput.safeParse({ kind: "guardian", id, action: "approve" }).success).toBe(true);
    expect(DecisionInput.safeParse({ kind: "guardian", id, action: "reject" }).success).toBe(false);
  });
});
