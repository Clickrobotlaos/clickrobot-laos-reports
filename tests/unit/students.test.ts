import { describe, expect, it } from "vitest";
import { reconcilePackage, summariseStudents, matchesSearch, type LegacyPackage, type LegacyAttendance } from "@/lib/cr360/students";
import { canAccessBranch } from "@/lib/cr360/access";
import type { Viewer } from "@/lib/cr360/types";

// FICTIONAL data only.
const pkg = (o: Partial<LegacyPackage>): LegacyPackage => ({
  id: "p1", student_id: "S-001", student_name: "Test Child", branch_id: "A", program_id: "prog", package: "8",
  sessions_total: 10, sessions_used: 0, base_sessions: 8, bonus_sessions: 2, start_date: "2026-10-01",
  active: true, student_status: "Active", created_at: "2026-10-01T00:00:00Z", ...o,
});
const att = (id: string, date: string, status = "Present", package_id = "p1"): LegacyAttendance => ({ id, package_id, date, status });

describe("legacy package reconciliation", () => {
  it("rebuilds the ledger: base + bonus credits, one debit per Present, Absent ignored", () => {
    const r = reconcilePackage(pkg({ sessions_used: 2 }), [att("a1", "2026-10-02"), att("a2", "2026-10-09", "Absent"), att("a3", "2026-10-16")]);
    expect(r.total).toBe(10);
    expect(r.derivedUsed).toBe(2);
    expect(r.remaining).toBe(8);
    expect(r.mismatch).toBe(false);
    expect(r.lines.filter((l) => l.kind === "credit")).toHaveLength(2);
    const debits = r.lines.filter((l) => l.kind === "debit");
    expect(debits.map((d) => d.kind === "debit" && d.balanceAfter)).toEqual([9, 8]);
  });
  it("flags a counter that disagrees with attendance (never silently trusted)", () => {
    const r = reconcilePackage(pkg({ sessions_used: 5 }), [att("a1", "2026-10-02")]);
    expect(r.mismatch).toBe(true);
    expect(r.storedUsed).toBe(5);
    expect(r.remaining).toBe(9); // derived from records
  });
  it("flags total ≠ base + bonus", () => {
    expect(reconcilePackage(pkg({ sessions_total: 12 }), []).mismatch).toBe(true);
  });
  it("reports overdrawn instead of clamping to zero", () => {
    const rows = Array.from({ length: 3 }, (_, i) => att(`a${i}`, `2026-10-0${i + 1}`));
    const r = reconcilePackage(pkg({ sessions_total: 2, base_sessions: 2, bonus_sessions: 0, sessions_used: 3 }), rows);
    expect(r.remaining).toBe(-1);
    expect(r.overdrawn).toBe(true);
  });
  it("ignores attendance belonging to other packages", () => {
    expect(reconcilePackage(pkg({}), [att("x", "2026-10-02", "Present", "other")]).derivedUsed).toBe(0);
  });
});

describe("student summaries", () => {
  it("groups by student code, sums active balances, flags low balance", () => {
    const s = summariseStudents(
      [pkg({ id: "p1", sessions_total: 2, base_sessions: 2, bonus_sessions: 0 }), pkg({ id: "p2", active: false, created_at: "2026-09-01T00:00:00Z" })],
      [att("a1", "2026-10-02")].map((a) => ({ ...a, package_id: "p1" })),
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ code: "S-001", packages: 2, activePackages: 1, remaining: 1, low: true });
  });
  it("never merges two different children who share a name", () => {
    const s = summariseStudents([pkg({ id: "p1", student_id: "S-1" }), pkg({ id: "p2", student_id: "S-2" })], []);
    expect(s).toHaveLength(2);
  });
  it("packages without a code stay separate", () => {
    const s = summariseStudents([pkg({ id: "p1", student_id: null }), pkg({ id: "p2", student_id: " " })], []);
    expect(s.map((x) => x.code).sort()).toEqual(["pkg:p1", "pkg:p2"]);
  });
});

describe("search & scoping helpers", () => {
  it("search matches name or code, case-insensitively; blank matches all", () => {
    const s = { name: "Test Child", code: "S-001" };
    expect(matchesSearch(s, "child")).toBe(true);
    expect(matchesSearch(s, "s-00")).toBe(true);
    expect(matchesSearch(s, "%")).toBe(false);
    expect(matchesSearch(s, "  ")).toBe(true);
  });
  it("manager of branch A cannot open a branch B student (IDOR guard used by the detail page)", () => {
    const mgrA: Viewer = { userId: "m", grants: [{ role: "manager", branchId: "A", active: true }] };
    expect(canAccessBranch(mgrA, "A")).toBe(true);
    expect(canAccessBranch(mgrA, "B")).toBe(false);
  });
});
