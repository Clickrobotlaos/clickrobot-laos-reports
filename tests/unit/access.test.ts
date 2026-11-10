import { describe, expect, it } from "vitest";
import {
  canAccessBranch, canReadEmployeeRecord, canReadExecutiveFinance, canReadPayroll, canReadStudent, workspacesFor, studentBranchScope,
} from "@/lib/cr360/access";
import type { Viewer } from "@/lib/cr360/types";
import { redactMoney, safeDirectoryRow } from "@/lib/cr360/redact";

// FICTIONAL test identities — not real staff or families.
const A = "branch-A", B = "branch-B";
const ceo: Viewer = { userId: "u-ceo", grants: [{ role: "ceo", branchId: null, active: true }] };
const managerA: Viewer = { userId: "u-mA", grants: [{ role: "manager", branchId: A, active: true }], employeeId: "e-mA" };
const staffA: Viewer = { userId: "u-sA", grants: [{ role: "staff", branchId: A, active: true }], employeeId: "e-sA" };
const teacherA: Viewer = { userId: "u-tA", grants: [{ role: "teacher", branchId: A, active: true }], employeeId: "e-tA" };
const financeA: Viewer = { userId: "u-fA", grants: [{ role: "finance", branchId: A, active: true }] };
const partner: Viewer = {
  userId: "u-p", grants: [{ role: "partner", branchId: null, active: true }],
  partnerGrants: [{ entityId: "hq", validFrom: "2026-01-01", validTo: "2026-12-31", scopes: ["executive_report"] }],
};
const guardianA: Viewer = { userId: "u-gA", grants: [{ role: "guardian", branchId: null, active: true }], guardianOf: ["child-A"] };
const revokedManager: Viewer = { userId: "u-x", grants: [{ role: "manager", branchId: A, active: false }] };

describe("manager branch restriction", () => {
  it("manager A can access branch A but not B", () => {
    expect(canAccessBranch(managerA, A)).toBe(true);
    expect(canAccessBranch(managerA, B)).toBe(false);
  });
  it("manager A cannot read branch B payroll or employee records", () => {
    expect(canReadPayroll(managerA, { branchId: A })).toBe(true);
    expect(canReadPayroll(managerA, { branchId: B })).toBe(false);
    expect(canReadEmployeeRecord(managerA, { employeeId: "e-other", branchId: B })).toBe(false);
  });
  it("manager never sees executive (CEO) compensation, even own branch", () => {
    expect(canReadPayroll(managerA, { branchId: A, isExecutive: true })).toBe(false);
  });
  it("inactive grants grant nothing", () => {
    expect(canAccessBranch(revokedManager, A)).toBe(false);
    expect(workspacesFor(revokedManager)).toEqual([]);
  });
  it("CEO sees all branches", () => {
    expect(canAccessBranch(ceo, B)).toBe(true);
  });
});

describe("self-only staff access", () => {
  it("staff reads own HR record only", () => {
    expect(canReadEmployeeRecord(staffA, { employeeId: "e-sA", branchId: A })).toBe(true);
    expect(canReadEmployeeRecord(staffA, { employeeId: "e-mA", branchId: A })).toBe(false);
  });
  it("staff gets only the staff workspace", () => {
    expect(workspacesFor(staffA)).toEqual(["staff"]);
  });
});

describe("payroll privacy", () => {
  it("staff cannot read payroll — not even their own (owner decision)", () => {
    expect(canReadPayroll(staffA, { branchId: A })).toBe(false);
  });
  it("teacher and branch finance cannot read payroll by role name", () => {
    expect(canReadPayroll(teacherA, { branchId: A })).toBe(false);
    expect(canReadPayroll(financeA, { branchId: A })).toBe(false);
  });
  it("redaction strips salary, bank and ID fields", () => {
    const row = { id: "1", name: "Test Person", base_salary: 5_000_000, bank_account_no: "000", id_card: "X", position: "Teacher" };
    const out = redactMoney(row);
    expect(out).toEqual({ id: "1", name: "Test Person", position: "Teacher" });
  });
  it("safe directory projection is an allow-list", () => {
    const out = safeDirectoryRow({ id: "1", display_name: "T", base_salary: 1, monthly_base_lak: 2, position: "P" });
    expect(Object.keys(out).sort()).toEqual(["display_name", "id", "position"]);
  });
});

describe("partner finance restriction", () => {
  it("partner reads only granted entity, scope and period", () => {
    expect(canReadExecutiveFinance(partner, { entityId: "hq", date: "2026-06-30", scope: "executive_report" })).toBe(true);
    expect(canReadExecutiveFinance(partner, { entityId: "franchise-x", date: "2026-06-30", scope: "executive_report" })).toBe(false);
    expect(canReadExecutiveFinance(partner, { entityId: "hq", date: "2027-01-01", scope: "executive_report" })).toBe(false);
    expect(canReadExecutiveFinance(partner, { entityId: "hq", date: "2026-06-30", scope: "distributions" })).toBe(false);
  });
  it("partner role never implies payroll access", () => {
    expect(canReadPayroll(partner, { branchId: A })).toBe(false);
    expect(canReadPayroll(partner, { branchId: A, isExecutive: true })).toBe(false);
  });
  it("finance role does not get executive finance by default", () => {
    expect(canReadExecutiveFinance(financeA, { entityId: "hq", date: "2026-06-30", scope: "executive_report" })).toBe(false);
  });
});

describe("non-guardian child denial", () => {
  it("guardian sees linked child only — guessed IDs denied", () => {
    expect(canReadStudent(guardianA, { id: "child-A", branchId: A })).toBe(true);
    expect(canReadStudent(guardianA, { id: "child-B", branchId: A })).toBe(false);
  });
  it("same-branch staff without teaching role cannot read child records", () => {
    expect(canReadStudent(staffA, { id: "child-A", branchId: A })).toBe(false);
  });
  it("teacher of branch A cannot read branch B child", () => {
    expect(canReadStudent(teacherA, { id: "child-B", branchId: B })).toBe(false);
  });
  it("anonymous denied everywhere", () => {
    expect(canReadStudent(null, { id: "child-A", branchId: A })).toBe(false);
    expect(canAccessBranch(undefined, A)).toBe(false);
    expect(workspacesFor(null)).toEqual([]);
  });
});

describe("student branch scope (legacy data boundary)", () => {
  it("CEO sees all, manager only granted branches, others nothing", () => {
    expect(studentBranchScope(ceo)).toBeNull();
    expect(studentBranchScope(managerA)).toEqual([A]);
    expect(studentBranchScope(staffA)).toEqual([]);
    expect(studentBranchScope(teacherA)).toEqual([]);
    expect(studentBranchScope(guardianA)).toEqual([]);
    expect(studentBranchScope(revokedManager)).toEqual([]);
    expect(studentBranchScope(null)).toEqual([]);
  });
  it("students workspace is CEO/manager only", () => {
    expect(workspacesFor(managerA)).toContain("students");
    expect(workspacesFor(staffA)).not.toContain("students");
    expect(workspacesFor(partner)).not.toContain("students");
  });
});
