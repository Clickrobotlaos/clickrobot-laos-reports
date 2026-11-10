import { describe, expect, it } from "vitest";
import { groupChildren } from "@/lib/cr360/parent";
import { canReadStudent, workspacesFor } from "@/lib/cr360/access";

const row = (o: Record<string, unknown>) => ({
  student_code: "TST-001", student_name: "Test Child", package_id: "p1", program_name: "Prog", branch_name: "Branch",
  package: "8", sessions_total: 8, sessions_used: 3, active: true, start_date: "2026-10-01", ...o,
});

describe("guardian portal grouping", () => {
  it("groups packages per child and computes sessions left", () => {
    const g = groupChildren([row({}), row({ package_id: "p2", sessions_used: 8, active: false }), row({ student_code: "TST-009", student_name: "Sibling", package_id: "p3" })]);
    expect(g).toHaveLength(2);
    expect(g[0].packages.map((p) => p.left)).toEqual([5, 0]);
    expect(g[1].name).toBe("Sibling");
  });
  it("empty input yields no children", () => {
    expect(groupChildren([])).toEqual([]);
  });
});

describe("guardian authorisation model", () => {
  const g = { userId: "g", grants: [{ role: "guardian" as const, branchId: null, active: true }], guardianOf: ["TST-001"] };
  it("guardian gets the parent workspace only", () => {
    expect(workspacesFor(g)).toEqual(["parent"]);
  });
  it("guardian can read only linked student codes, regardless of branch", () => {
    expect(canReadStudent(g, { id: "TST-001", branchId: "any" })).toBe(true);
    expect(canReadStudent(g, { id: "TST-002", branchId: "any" })).toBe(false);
  });
});
