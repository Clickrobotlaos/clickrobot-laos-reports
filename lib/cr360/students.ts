/**
 * Student & session-balance logic over the LEGACY tables (pure, no I/O).
 * Legacy has no students table: a student is identified by student_packages.student_id (text code).
 * The legacy balance is a mutable counter (sessions_used); here we rebuild the ledger from
 * attendance rows and flag any package whose counter disagrees, so staff can reconcile before
 * the ledger migration. Nothing here writes data.
 */
export interface LegacyPackage {
  id: string;
  student_id: string | null;
  student_name: string;
  branch_id: string | null;
  program_id: string | null;
  package: string | null;
  sessions_total: number | null;
  sessions_used: number | null;
  base_sessions: number | null;
  bonus_sessions: number | null;
  start_date: string | null;
  active: boolean | null;
  student_status: string | null;
  created_at?: string | null;
}

export interface LegacyAttendance {
  id: string;
  package_id: string;
  date: string;
  status: "Present" | "Absent" | string;
  is_makeup?: boolean | null;
  class_id?: string | null;
  created_at?: string | null;
}

export type LedgerLine =
  | { kind: "credit"; label: "base" | "bonus"; sessions: number; date: string | null }
  | { kind: "debit"; attendanceId: string; date: string; makeup: boolean; balanceAfter: number };

export interface Reconciliation {
  packageId: string;
  total: number;
  storedUsed: number;
  derivedUsed: number;
  remaining: number; // derived (authoritative for display); never negative-clamped silently
  mismatch: boolean;
  overdrawn: boolean;
  lines: LedgerLine[];
}

export const LOW_BALANCE = 2;

/** Rebuild the per-package ledger from attendance; Absent rows do not debit (legacy trigger semantics). */
export function reconcilePackage(pkg: LegacyPackage, attendance: LegacyAttendance[]): Reconciliation {
  const base = pkg.base_sessions ?? pkg.sessions_total ?? 0;
  const bonus = pkg.bonus_sessions ?? 0;
  const total = pkg.sessions_total ?? base + bonus;
  const lines: LedgerLine[] = [{ kind: "credit", label: "base", sessions: base, date: pkg.start_date }];
  if (bonus > 0) lines.push({ kind: "credit", label: "bonus", sessions: bonus, date: pkg.start_date });

  const present = attendance
    .filter((a) => a.package_id === pkg.id && a.status === "Present")
    .sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  let bal = total;
  for (const a of present) {
    bal -= 1;
    lines.push({ kind: "debit", attendanceId: a.id, date: a.date, makeup: !!a.is_makeup, balanceAfter: bal });
  }
  const storedUsed = pkg.sessions_used ?? 0;
  return {
    packageId: pkg.id, total, storedUsed, derivedUsed: present.length, remaining: bal,
    mismatch: storedUsed !== present.length || total !== base + bonus, overdrawn: bal < 0, lines,
  };
}

export interface StudentSummary {
  code: string;
  name: string;
  branchIds: string[];
  packages: number;
  activePackages: number;
  remaining: number; // across active packages
  low: boolean;
  mismatch: boolean;
  status: string;
}

/** Group packages by student code; packages without a code are keyed by package id (never merged by name). */
export function summariseStudents(pkgs: LegacyPackage[], attendance: LegacyAttendance[]): StudentSummary[] {
  const byCode = new Map<string, LegacyPackage[]>();
  for (const p of pkgs) {
    const key = p.student_id?.trim() || `pkg:${p.id}`;
    byCode.set(key, [...(byCode.get(key) ?? []), p]);
  }
  const attByPkg = new Map<string, LegacyAttendance[]>();
  for (const a of attendance) attByPkg.set(a.package_id, [...(attByPkg.get(a.package_id) ?? []), a]);

  return [...byCode.entries()].map(([code, list]) => {
    const recs = list.map((p) => ({ p, r: reconcilePackage(p, attByPkg.get(p.id) ?? []) }));
    const active = recs.filter((x) => x.p.active);
    const remaining = active.reduce((s, x) => s + x.r.remaining, 0);
    const newest = [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    return {
      code,
      name: newest.student_name,
      branchIds: [...new Set(list.map((p) => p.branch_id).filter((x): x is string => !!x))],
      packages: list.length,
      activePackages: active.length,
      remaining,
      low: active.length > 0 && remaining <= LOW_BALANCE,
      mismatch: recs.some((x) => x.r.mismatch),
      status: newest.student_status ?? (active.length ? "Active" : "Inactive"),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Case-insensitive search over name and code, done in memory on rows already scoped server-side
 * (no user text is ever interpolated into a database filter). */
export function matchesSearch(s: { name: string; code: string }, q: string): boolean {
  const n = q.trim().toLowerCase().slice(0, 60);
  if (!n) return true;
  return s.name.toLowerCase().includes(n) || s.code.toLowerCase().includes(n);
}
