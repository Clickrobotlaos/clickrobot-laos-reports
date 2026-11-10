import type { GuardianChildRow } from "./viewer-types";

/** Group guardian rows into children with their packages (pure; rows come only from the verified-link function). */
export function groupChildren(rows: Pick<GuardianChildRow, "student_code" | "student_name" | "package_id" | "program_name" | "branch_name" | "package" | "sessions_total" | "sessions_used" | "active" | "start_date">[]) {
  const map = new Map<string, { code: string; name: string; packages: typeof rows }>();
  for (const r of rows) {
    const c = map.get(r.student_code) ?? { code: r.student_code, name: r.student_name, packages: [] };
    c.packages.push(r);
    map.set(r.student_code, c);
  }
  return [...map.values()].map((c) => ({
    ...c,
    packages: c.packages.map((p) => ({ ...p, left: (p.sessions_total ?? 0) - (p.sessions_used ?? 0) })),
  }));
}
