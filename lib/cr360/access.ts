/**
 * Pure authorization decisions (default deny).
 * These mirror — and never replace — database RLS. Every server route calls
 * these AND relies on RLS, so a bug in one layer is caught by the other.
 */
import type { AppRole, Viewer, Workspace } from "./types";

const active = (v: Viewer) => v.grants.filter((g) => g.active);

export function hasRole(v: Viewer | null | undefined, roles: AppRole[]): boolean {
  if (!v) return false;
  return active(v).some((g) => roles.includes(g.role));
}

/** Org-wide roles see every branch; branch-bound roles see only explicitly granted branches. */
export function canAccessBranch(v: Viewer | null | undefined, branchId: string): boolean {
  if (!v || !branchId) return false;
  return active(v).some(
    (g) =>
      ((g.role === "ceo" || g.role === "hr") && g.branchId === null) ||
      (g.role !== "guardian" && g.role !== "partner" && g.branchId === branchId),
  );
}

/** HR records (attendance, leave, directory) of another employee. */
export function canReadEmployeeRecord(
  v: Viewer | null | undefined,
  target: { employeeId: string; branchId: string },
): boolean {
  if (!v) return false;
  if (v.employeeId && v.employeeId === target.employeeId) return true; // self
  return active(v).some(
    (g) =>
      ((g.role === "ceo" || g.role === "hr") && g.branchId === null) ||
      (g.role === "manager" && g.branchId === target.branchId),
  );
}

/**
 * Payroll money fields (salary, payslips, bonus, deductions, bank). Owner decision B (2026-11-11),
 * mirrored in the database by 0002 (cr360_authz.can_read_confidential_hr + salary_payroll policies):
 *  - CEO: everything except nothing (executive pay included).
 *  - Explicit payroll grant (CEO-granted, revocable): staff pay for processing; never executive pay.
 *  - Everyone (staff, teacher, manager, HR, finance): their OWN pay records only.
 *  - Branch managers, HR and finance get NOTHING else by role name alone; partners nothing here.
 */
export function canReadPayroll(
  v: Viewer | null | undefined,
  target: { branchId: string; employeeId?: string | null; isExecutive?: boolean },
): boolean {
  if (!v || active(v).length === 0) return false;
  if (hasRole(v, ["ceo"])) return true;
  if (target.isExecutive) return false; // CEO / executive compensation is confidential finance
  if (v.payrollAccess === true) return true;
  return !!target.employeeId && !!v.employeeId && target.employeeId === v.employeeId;
}

/** Executive / partner finance: CEO, or a partner with an explicit, in-window grant for that entity+scope. */
export function canReadExecutiveFinance(
  v: Viewer | null | undefined,
  req: { entityId: string; date: string; scope: "executive_report" | "distributions" | "investment" },
): boolean {
  if (!v) return false;
  if (hasRole(v, ["ceo"])) return true;
  if (!hasRole(v, ["partner"])) return false;
  return (v.partnerGrants ?? []).some(
    (p) =>
      p.entityId === req.entityId &&
      p.scopes.includes(req.scope) &&
      p.validFrom <= req.date &&
      req.date <= p.validTo,
  );
}

/**
 * Child records. A guardian needs an explicit verified link; the child's branch is NOT enough.
 * Staff need branch access (teacher scoping to assigned classes is enforced in RLS, phase 1b).
 */
export function canReadStudent(
  v: Viewer | null | undefined,
  student: { id: string; branchId: string },
): boolean {
  if (!v) return false;
  if ((v.guardianOf ?? []).includes(student.id)) return true;
  return active(v).some(
    (g) =>
      ((g.role === "ceo") && g.branchId === null) ||
      (["manager", "teacher", "reception"].includes(g.role) && g.branchId === student.branchId),
  );
}

/** Which workspaces appear in navigation. Pages re-check on the server. */
export function workspacesFor(v: Viewer | null | undefined): Workspace[] {
  if (!v) return [];
  const out: Workspace[] = [];
  if (hasRole(v, ["ceo"])) out.push("ceo");
  if (hasRole(v, ["ceo", "hr", "manager"])) out.push("manager");
  if (hasRole(v, ["ceo", "manager"])) out.push("students", "classes", "crm");
  if (v.employeeId) out.push("staff");
  if ((v.guardianOf ?? []).length > 0 || hasRole(v, ["guardian"])) out.push("parent");
  if (hasRole(v, ["ceo", "finance"])) out.push("finance");
  if (hasRole(v, ["ceo", "school_partner", "franchise_admin"])) out.push("schools");
  return out;
}

export function canUseWorkspace(v: Viewer | null | undefined, w: Workspace): boolean {
  return workspacesFor(v).includes(w);
}

/** Branch filter for legacy student data: null = all branches (CEO), else the explicit granted branches. */
export function studentBranchScope(v: Viewer | null | undefined): string[] | null {
  if (!v) return [];
  if (active(v).some((g) => g.role === "ceo" && g.branchId === null)) return null;
  return [...new Set(active(v).filter((g) => g.role === "manager" && g.branchId).map((g) => g.branchId as string))];
}
