import { describe, expect, it } from "vitest";
import { DecisionInput } from "@/lib/cr360/schemas";
import { decisionErrorCode } from "@/lib/cr360/decision-errors";

const id = "60000000-0000-4000-8000-0000000000a2";

describe("approval decision contract", () => {
  it("approve needs no reason; reject requires one", () => {
    expect(DecisionInput.safeParse({ kind: "leave", id, action: "approve" }).success).toBe(true);
    expect(DecisionInput.safeParse({ kind: "leave", id, action: "reject" }).success).toBe(false);
    expect(DecisionInput.safeParse({ kind: "leave", id, action: "reject", reason: "  " }).success).toBe(false);
    expect(DecisionInput.safeParse({ kind: "ot", id, action: "reject", reason: "overlaps exam week" }).success).toBe(true);
  });
  it("rejects unknown kinds, bad ids and client-supplied reviewer fields", () => {
    expect(DecisionInput.safeParse({ kind: "payroll", id, action: "approve" }).success).toBe(false);
    expect(DecisionInput.safeParse({ kind: "leave", id: "123", action: "approve" }).success).toBe(false);
    expect(DecisionInput.safeParse({ kind: "leave", id, action: "approve", reviewedBy: "someone" }).success).toBe(false);
  });
});

describe("decision error mapping (codes verified against the DB harness)", () => {
  it("maps a missing function (0004 not applied) to not_enabled / 501", () => {
    expect(decisionErrorCode({ code: "PGRST202", message: "Could not find the function public.cr360_hr_decide_request" })).toEqual({ code: "not_enabled", status: 501 });
  });
  it("maps DB authorisation outcomes", () => {
    expect(decisionErrorCode({ code: "40001", message: "already decided" }).code).toBe("already_decided");
    expect(decisionErrorCode({ code: "42501", message: "cannot decide own request" }).code).toBe("self_decision");
    expect(decisionErrorCode({ code: "42501", message: "access denied" })).toEqual({ code: "forbidden", status: 403 });
    expect(decisionErrorCode({ code: "P0002", message: "not found" }).status).toBe(404);
    expect(decisionErrorCode({ code: "22023", message: "reason required" }).code).toBe("validation");
    expect(decisionErrorCode({ code: "XX000", message: "boom" }).code).toBe("server_error");
  });
});
