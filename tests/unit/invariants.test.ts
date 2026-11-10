import { describe, expect, it } from "vitest";
import { balance, debitForAttendance, reverseAttendance, type LedgerEntry } from "@/lib/cr360/ledger";
import { bookSeat, findTeacherConflict, type Booking } from "@/lib/cr360/booking";
import { precheckPunch, haversineMeters, clockErrorCode } from "@/lib/cr360/geo";
import { transition, draftNet, canEditLines, type PayrollRun } from "@/lib/cr360/payroll";
import { parseMinor, toLakMinor, formatMinor } from "@/lib/cr360/money";
import { attendancePercent } from "@/lib/cr360/staff-metrics";
import { computeCeoKpis } from "@/lib/cr360/kpis";
import { ClockInput, LeaveInput, OtInput } from "@/lib/cr360/schemas";

const at = "2026-11-10T03:00:00Z";
const purchase: LedgerEntry = { id: "p1", packageId: "pkg", studentId: "s1", kind: "purchase", delta: 2, actorId: "fin", at };

describe("duplicate attendance (session ledger)", () => {
  it("first present debits exactly one session", () => {
    const r = debitForAttendance([purchase], { id: "d1", packageId: "pkg", studentId: "s1", classSessionId: "cs1", actorId: "t", at });
    expect(r.ok).toBe(true);
    if (r.ok) expect(balance([purchase, r.entry], "pkg")).toBe(1);
  });
  it("double-click present is rejected as duplicate", () => {
    const d1 = { id: "d1", packageId: "pkg", studentId: "s1", classSessionId: "cs1", kind: "attendance" as const, delta: -1, actorId: "t", at };
    const r = debitForAttendance([purchase, d1], { id: "d2", packageId: "pkg", studentId: "s1", classSessionId: "cs1", actorId: "t", at });
    expect(r).toEqual({ ok: false, code: "duplicate" });
  });
  it("reversal appends a compensating credit and keeps the original", () => {
    const d1: LedgerEntry = { id: "d1", packageId: "pkg", studentId: "s1", classSessionId: "cs1", kind: "attendance", delta: -1, actorId: "t", at };
    const rv = reverseAttendance([purchase, d1], { id: "r1", studentId: "s1", classSessionId: "cs1", actorId: "mgr", reason: "marked wrong child", at });
    expect(rv.ok).toBe(true);
    if (!rv.ok) return;
    const ledger = [purchase, d1, rv.entry];
    expect(ledger).toContain(d1);
    expect(balance(ledger, "pkg")).toBe(2);
    // After reversal a fresh debit is allowed again (still at most one live debit)
    expect(debitForAttendance(ledger, { id: "d3", packageId: "pkg", studentId: "s1", classSessionId: "cs1", actorId: "t", at }).ok).toBe(true);
  });
  it("reversal requires a reason", () => {
    expect(reverseAttendance([purchase], { id: "r", studentId: "s1", classSessionId: "cs1", actorId: "m", reason: "", at })).toEqual({ ok: false, code: "reason_required" });
  });
  it("no debit without remaining balance", () => {
    const used: LedgerEntry[] = [purchase,
      { id: "a", packageId: "pkg", studentId: "s1", classSessionId: "x", kind: "attendance", delta: -1, actorId: "t", at },
      { id: "b", packageId: "pkg", studentId: "s1", classSessionId: "y", kind: "attendance", delta: -1, actorId: "t", at }];
    expect(debitForAttendance(used, { id: "c", packageId: "pkg", studentId: "s1", classSessionId: "z", actorId: "t", at })).toEqual({ ok: false, code: "no_balance" });
  });
});

describe("duplicate booking & capacity", () => {
  const existing: Booking[] = [
    { id: "b1", classSessionId: "cs", studentId: "s1", status: "confirmed" },
    { id: "b2", classSessionId: "cs", studentId: "s2", status: "cancelled" },
  ];
  it("same student cannot book the same session twice", () => {
    expect(bookSeat(existing, { id: "n", classSessionId: "cs", studentId: "s1", capacity: 8 })).toEqual({ ok: false, code: "duplicate" });
  });
  it("full room rejects; cancelled seats do not count", () => {
    expect(bookSeat(existing, { id: "n", classSessionId: "cs", studentId: "s3", capacity: 1 })).toEqual({ ok: false, code: "full" });
    expect(bookSeat(existing, { id: "n", classSessionId: "cs", studentId: "s2", capacity: 2 }).ok).toBe(true);
  });
  it("teacher overlap across branches is detected; back-to-back is fine", () => {
    const slots = [{ teacherId: "t1", startsAt: "2026-11-10T02:00:00Z", endsAt: "2026-11-10T03:00:00Z", branchId: "A", sessionId: "x" }];
    expect(findTeacherConflict(slots, { teacherId: "t1", startsAt: "2026-11-10T02:30:00Z", endsAt: "2026-11-10T03:30:00Z", branchId: "B", sessionId: "y" })).not.toBeNull();
    expect(findTeacherConflict(slots, { teacherId: "t1", startsAt: "2026-11-10T03:00:00Z", endsAt: "2026-11-10T04:00:00Z", branchId: "B", sessionId: "y" })).toBeNull();
  });
});

describe("GPS pre-check (non-authoritative)", () => {
  const site = { latitude: 17.9667, longitude: 102.6, radiusM: 10, enabled: true, approved: true }; // FICTIONAL test point
  it("disabled or unapproved sites are rejected", () => {
    expect(precheckPunch({ site: null, latitude: 0, longitude: 0, accuracyM: 5 }).result).toBe("site_disabled");
    expect(precheckPunch({ site: { ...site, approved: false }, latitude: site.latitude, longitude: site.longitude, accuracyM: 5 }).result).toBe("site_disabled");
  });
  it("accuracy worse than 10 m needs review", () => {
    expect(precheckPunch({ site, latitude: site.latitude, longitude: site.longitude, accuracyM: 25 }).result).toBe("low_accuracy");
  });
  it("in-zone passes to server; ~15 m away is outside", () => {
    expect(precheckPunch({ site, latitude: site.latitude, longitude: site.longitude + 0.00004, accuracyM: 5 }).result).toBe("ok_pending_server");
    expect(precheckPunch({ site, latitude: site.latitude + 0.000135, longitude: site.longitude, accuracyM: 5 }).result).toBe("outside_zone");
  });
  it("haversine sanity: 0.001° lat ≈ 111 m", () => {
    expect(Math.round(haversineMeters(0, 0, 0.001, 0))).toBe(111);
  });
  it("maps DB errors to stable codes", () => {
    expect(clockErrorCode("site not approved")).toBe("site_disabled");
    expect(clockErrorCode("check-in/check-out sequence invalid")).toBe("sequence_invalid");
    expect(clockErrorCode("invalid or insufficient GPS accuracy")).toBe("low_accuracy");
  });
});

describe("payroll separation of duties", () => {
  const run: PayrollRun = { id: "r", month: "2026-11", status: "draft", preparedBy: "hr1", locked: false, version: 1 };
  it("preparer cannot approve own run; approver cannot mark paid", () => {
    const rev = transition(run, "submit_review", "hr1", 1);
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    expect(transition(rev.run, "approve", "hr1", 2)).toEqual({ ok: false, code: "same_person" });
    const ap = transition(rev.run, "approve", "ceo", 2);
    expect(ap.ok).toBe(true);
    if (!ap.ok) return;
    expect(ap.run.locked).toBe(true);
    expect(canEditLines(ap.run)).toBe(false);
    expect(transition(ap.run, "mark_paid", "ceo", 3)).toEqual({ ok: false, code: "same_person" });
    expect(transition(ap.run, "mark_paid", "fin2", 3).ok).toBe(true);
  });
  it("stale version is rejected (concurrency guard)", () => {
    expect(transition(run, "submit_review", "hr1", 0)).toEqual({ ok: false, code: "stale" });
  });
  it("negative net pay requires review", () => {
    expect(() => draftNet({ baseMinor: 100n, approvedBonusMinor: 0n, approvedOtMinor: 0n, lawfulDeductionMinor: 200n })).toThrow();
  });
});

describe("money (minor units, rate snapshots)", () => {
  it("parses exactly without float error", () => {
    expect(parseMinor("0.1") + parseMinor("0.2")).toBe(30n);
  });
  it("converts USD to LAK with snapshot, rounding half-up", () => {
    const lak = toLakMinor({ amountMinor: parseMinor("10.00"), currency: "USD" }, { currency: "USD", lakPerUnit: "21950.5", effectiveDate: "2026-11-01", source: "test" });
    expect(lak).toBe(parseMinor("219505"));
    expect(formatMinor({ amountMinor: lak, currency: "LAK" })).toBe("219,505 LAK");
  });
  it("rejects mismatched snapshot", () => {
    expect(() => toLakMinor({ amountMinor: 1n, currency: "THB" }, { currency: "USD", lakPerUnit: "1", effectiveDate: "x", source: "x" })).toThrow();
  });
});

describe("staff metrics & KPIs", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("attendance % counts only ended shifts with an in-window check-in", () => {
    const shifts = [
      { id: "1", starts_at: "2026-11-08T02:00:00Z", ends_at: "2026-11-08T10:00:00Z", status: "completed" },
      { id: "2", starts_at: "2026-11-09T02:00:00Z", ends_at: "2026-11-09T10:00:00Z", status: "completed" },
      { id: "3", starts_at: "2026-11-11T02:00:00Z", ends_at: "2026-11-11T10:00:00Z", status: "scheduled" },
      { id: "4", starts_at: "2026-11-07T02:00:00Z", ends_at: "2026-11-07T10:00:00Z", status: "cancelled" },
    ];
    const punches = [{ kind: "in" as const, occurred_at: "2026-11-08T01:45:00Z" }];
    expect(attendancePercent(shifts, punches, now)).toBe(50);
    expect(attendancePercent([], [], now)).toBeNull();
  });
  it("CEO KPIs count real rows only", () => {
    const k = computeCeoKpis({
      branches: [{ id: "A", name: "Branch A", active: true }],
      packages: [
        { id: "1", branch_id: "A", sessions_total: 10, sessions_used: 9, active: true },
        { id: "2", branch_id: "A", sessions_total: 10, sessions_used: 1, active: true },
        { id: "3", branch_id: "A", sessions_total: 10, sessions_used: 10, active: false },
      ],
      attendanceToday: [{ id: "a", status: "Present" }, { id: "b", status: "Absent" }],
      leads: [{ id: "l1", branch_id: "A", status: "New" }, { id: "l2", branch_id: "A", status: "Registered" }],
      invoices: [{ id: "i1", branch_id: null, status: "Sent" }, { id: "i2", branch_id: "A", status: "Paid" }],
    });
    expect(k).toMatchObject({ activePackages: 2, lowSessions: 1, presentToday: 1, openLeads: 1, unpaidInvoices: 1 });
    expect(k.byBranch.find((r) => r.branch === "Unassigned")?.unpaid).toBe(1);
  });
});

describe("API input contracts", () => {
  it("clock input rejects client-supplied ownership/time fields", () => {
    const base = { action: "in", latitude: 1, longitude: 1, reportedAccuracyM: 5, nonce: "12345678" };
    expect(ClockInput.safeParse(base).success).toBe(true);
    expect(ClockInput.safeParse({ ...base, employeeId: "someone-else" }).success).toBe(false);
    expect(ClockInput.safeParse({ ...base, occurredAt: "2020-01-01T00:00:00Z" }).success).toBe(false);
  });
  it("leave end before start is invalid; OT must be 15-min multiple", () => {
    expect(LeaveInput.safeParse({ type: "annual", startDate: "2026-11-10", endDate: "2026-11-09", reason: "trip" }).success).toBe(false);
    expect(OtInput.safeParse({ date: "2026-11-10", minutes: 50, reason: "event" }).success).toBe(false);
    expect(OtInput.safeParse({ date: "2026-11-10", minutes: 45, reason: "event" }).success).toBe(true);
  });
});
