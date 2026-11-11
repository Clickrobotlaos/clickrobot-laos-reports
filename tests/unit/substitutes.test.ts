import { describe, expect, it } from "vitest";
import { SubstituteInput } from "@/lib/cr360/schemas";

const C = "40000000-0000-4000-8000-000000000001", U = "00000000-0000-4000-8000-0000000000a3";

describe("substitute assignment contract", () => {
  it("accepts a valid assignment and a revoke", () => {
    expect(SubstituteInput.safeParse({ action: "assign", classId: C, userId: U, startsOn: "2026-12-01", endsOn: "2026-12-02", reason: "sick leave" }).success).toBe(true);
    expect(SubstituteInput.safeParse({ action: "revoke", id: C }).success).toBe(true);
  });
  it("rejects end before start, short reasons, unknown fields and bad ids", () => {
    expect(SubstituteInput.safeParse({ action: "assign", classId: C, userId: U, startsOn: "2026-12-03", endsOn: "2026-12-02", reason: "sick leave" }).success).toBe(false);
    expect(SubstituteInput.safeParse({ action: "assign", classId: C, userId: U, startsOn: "2026-12-01", endsOn: "2026-12-02", reason: "x" }).success).toBe(false);
    expect(SubstituteInput.safeParse({ action: "assign", classId: C, userId: U, startsOn: "2026-12-01", endsOn: "2026-12-02", reason: "ok ok", branchId: C }).success).toBe(false);
    expect(SubstituteInput.safeParse({ action: "assign", classId: "nope", userId: U, startsOn: "2026-12-01", endsOn: "2026-12-02", reason: "ok ok" }).success).toBe(false);
    expect(SubstituteInput.safeParse({ action: "delete", id: C }).success).toBe(false);
  });
});
