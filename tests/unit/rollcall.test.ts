import { describe, expect, it } from "vitest";
import { canTakeAttendance, planMark, roster, type RosterPackage, type TodayAttendance } from "@/lib/cr360/rollcall";
import type { LegacyBooking, LegacyClass } from "@/lib/cr360/timetable";
import { MarkAttendanceInput } from "@/lib/cr360/schemas";

// FICTIONAL data.
const date = "2026-11-14";
const cls: LegacyClass = { id: "c1", name: "Spike A", program_id: null, branch_id: "A", teacher_id: "t1", assistant_id: "t2", day_of_week: 6, start_time: "10:00:00", end_time: "11:00:00", room: null, capacity: 6, level: null, active: true };
const bk = (o: Partial<LegacyBooking>): LegacyBooking => ({ id: Math.random().toString(36), class_id: "c1", package_id: "p1", kind: "regular", makeup_date: null, status: "Confirmed", ...o });
const pk = (id: string, name: string, total: number, used: number): RosterPackage => ({ id, student_name: name, sessions_total: total, sessions_used: used, active: true });
const pkgs = [pk("p1", "Bee", 8, 2), pk("p2", "Ann", 8, 8), pk("p3", "Cat", 8, 0), pk("p4", "Dan", 8, 1)];

describe("who may take attendance", () => {
  it("teacher, assistant, branch manager, CEO — nobody else", () => {
    expect(canTakeAttendance(cls, "t1", { isCeo: false, managerOf: [] })).toBe(true);
    expect(canTakeAttendance(cls, "t2", { isCeo: false, managerOf: [] })).toBe(true);
    expect(canTakeAttendance(cls, "m", { isCeo: false, managerOf: ["A"] })).toBe(true);
    expect(canTakeAttendance(cls, "m", { isCeo: false, managerOf: ["B"] })).toBe(false);
    expect(canTakeAttendance(cls, "other-teacher", { isCeo: false, managerOf: [] })).toBe(false);
    expect(canTakeAttendance(cls, "x", { isCeo: true, managerOf: [] })).toBe(true);
  });
});

describe("roster", () => {
  const bookings = [bk({ package_id: "p1" }), bk({ package_id: "p2" }), bk({ package_id: "p3", kind: "makeup", makeup_date: date }),
    bk({ package_id: "p4", kind: "makeup", makeup_date: "2026-11-21" }), bk({ package_id: "p1", status: "Cancelled" }), bk({ package_id: "p9" })];
  const att: TodayAttendance[] = [{ id: "a1", package_id: "p1", class_id: "c1", status: "Present", date }, { id: "a2", package_id: "p2", class_id: "c9", status: "Present", date }];
  const r = roster(cls, bookings, pkgs, att, date);
  it("includes regulars and today's makeups only, de-duplicated, sorted by name", () => {
    expect(r.map((e) => e.name)).toEqual(["Ann", "Bee", "Cat"]);
    expect(r.find((e) => e.name === "Cat")?.kind).toBe("makeup");
  });
  it("shows today's status and flags marks made in another class", () => {
    expect(r.find((e) => e.name === "Bee")?.status).toBe("Present");
    expect(r.find((e) => e.name === "Ann")).toMatchObject({ status: null, markedElsewhere: true, remaining: 0 });
  });
  it("a row recorded without a class (Records app Quick Scan) is shown and labelled, not duplicated", () => {
    const r2 = roster(cls, [bk({ package_id: "p3" })], pkgs, [{ id: "q", package_id: "p3", class_id: null, status: "Present", date }], date);
    expect(r2[0]).toMatchObject({ status: "Present", recordedWithoutClass: true, markedElsewhere: false });
  });
});

describe("mark plan (no double debit, no overdraw)", () => {
  const entry = { packageId: "p1", name: "Bee", kind: "regular" as const, remaining: 6, status: null, markedElsewhere: false, recordedWithoutClass: false };
  it("first mark inserts; same mark again is a no-op (double tap)", () => {
    expect(planMark(entry, undefined, "Present", "c1")).toEqual({ op: "insert" });
    expect(planMark(entry, { id: "a1", package_id: "p1", class_id: "c1", status: "Present", date }, "Present", "c1")).toEqual({ op: "noop" });
  });
  it("switching Present ↔ Absent updates the same row (legacy trigger adjusts the balance)", () => {
    expect(planMark(entry, { id: "a1", package_id: "p1", class_id: "c1", status: "Present", date }, "Absent", "c1")).toEqual({ op: "update", attendanceId: "a1" });
  });
  it("refuses Present when no sessions remain, but Absent is fine", () => {
    const empty = { ...entry, remaining: 0 };
    expect(planMark(empty, undefined, "Present", "c1")).toEqual({ op: "reject", code: "no_balance" });
    expect(planMark(empty, undefined, "Absent", "c1")).toEqual({ op: "insert" });
    // already Present (session already debited) → re-marking Present is a no-op, not a second debit
    expect(planMark(empty, { id: "a1", package_id: "p1", class_id: "c1", status: "Present", date }, "Present", "c1")).toEqual({ op: "noop" });
  });
  it("refuses students not booked in this class, or already marked in another class today", () => {
    expect(planMark(undefined, undefined, "Present", "c1")).toEqual({ op: "reject", code: "not_booked" });
    expect(planMark(entry, { id: "a2", package_id: "p1", class_id: "c9", status: "Present", date }, "Absent", "c1")).toEqual({ op: "reject", code: "marked_elsewhere" });
  });
});

describe("mark attendance contract", () => {
  it("never accepts a client date, user or balance", () => {
    const ok = { classId: "40000000-0000-4000-8000-000000000001", packageId: "30000000-0000-4000-8000-000000000001", status: "Present" };
    expect(MarkAttendanceInput.safeParse(ok).success).toBe(true);
    expect(MarkAttendanceInput.safeParse({ ...ok, date: "2020-01-01" }).success).toBe(false);
    expect(MarkAttendanceInput.safeParse({ ...ok, recordedBy: "x" }).success).toBe(false);
    expect(MarkAttendanceInput.safeParse({ ...ok, status: "Late" }).success).toBe(false);
  });
});
