import { describe, expect, it } from "vitest";
import { dayOfWeek, findConflicts, minutes, occupancy, seatGrid, weekGrid, type LegacyBooking, type LegacyClass } from "@/lib/cr360/timetable";

// FICTIONAL classes.
const cls = (o: Partial<LegacyClass>): LegacyClass => ({
  id: "c1", name: "Spike Prime A", program_id: null, branch_id: "A", teacher_id: "t1", assistant_id: null,
  day_of_week: 6, start_time: "10:00:00", end_time: "11:30:00", room: "Room 1", capacity: 4, level: null, active: true, ...o,
});
const bk = (o: Partial<LegacyBooking>): LegacyBooking => ({ id: Math.random().toString(36), class_id: "c1", package_id: "p", kind: "regular", makeup_date: null, status: "Confirmed", ...o });

describe("occupancy mirrors legacy check_class_capacity", () => {
  it("counts confirmed regulars + makeups for that date only", () => {
    const b = [bk({}), bk({}), bk({ status: "Cancelled" }), bk({ kind: "makeup", makeup_date: "2026-11-14" }), bk({ kind: "makeup", makeup_date: "2026-11-21" }), bk({ class_id: "other" })];
    expect(occupancy(cls({}), b, "2026-11-14")).toMatchObject({ regular: 2, makeup: 1, used: 3, free: 1, full: false });
    expect(occupancy(cls({}), b, "2026-11-21").used).toBe(3);
    expect(occupancy(cls({}), b, "2026-11-28").used).toBe(2);
  });
  it("full and over-capacity are distinguished; null/0 capacity = unlimited (legacy semantics)", () => {
    const four = [bk({}), bk({}), bk({}), bk({})];
    expect(occupancy(cls({}), four, "2026-11-14")).toMatchObject({ full: true, over: false });
    expect(occupancy(cls({ capacity: 3 }), four, "2026-11-14")).toMatchObject({ full: true, over: true, free: -1 });
    expect(occupancy(cls({ capacity: 0 }), four, "2026-11-14")).toMatchObject({ capacity: null, full: false, free: null });
  });
});

describe("conflicts", () => {
  it("same teacher overlapping in two different branches is a conflict", () => {
    const c = findConflicts([cls({ id: "a" }), cls({ id: "b", branch_id: "B", room: "Lab", start_time: "11:00:00", end_time: "12:00:00" })]);
    expect(c).toEqual([{ kind: "teacher", a: "a", b: "b", day: 6, who: "t1" }]);
  });
  it("assistant double-booked counts too; back-to-back is fine", () => {
    expect(findConflicts([cls({ id: "a", assistant_id: "t9" }), cls({ id: "b", teacher_id: "t9", room: "X" })]).map((x) => x.who)).toEqual(["t9"]);
    expect(findConflicts([cls({ id: "a" }), cls({ id: "b", start_time: "11:30:00", end_time: "12:30:00" })])).toEqual([]);
  });
  it("room clash only within the same branch, case-insensitive; inactive classes ignored", () => {
    const r = findConflicts([cls({ id: "a", teacher_id: "t1" }), cls({ id: "b", teacher_id: "t2", room: " room 1 " })]);
    expect(r).toEqual([{ kind: "room", a: "a", b: "b", day: 6, who: "Room 1" }]);
    expect(findConflicts([cls({ id: "a" }), cls({ id: "b", teacher_id: "t2", branch_id: "B" })])).toEqual([]);
    expect(findConflicts([cls({ id: "a" }), cls({ id: "b", active: false })])).toEqual([]);
  });
});

describe("grid & helpers", () => {
  it("week grid is Monday-first and time-sorted; skips inactive and unscheduled", () => {
    const g = weekGrid([cls({ id: "late", start_time: "14:00:00" }), cls({ id: "early", start_time: "09:00:00" }), cls({ id: "mon", day_of_week: 1 }), cls({ id: "x", active: false }), cls({ id: "n", day_of_week: null })]);
    expect(g[0]).toMatchObject({ day: 1 });
    expect(g[0].classes.map((c) => c.id)).toEqual(["mon"]);
    expect(g[5].classes.map((c) => c.id)).toEqual(["early", "late"]);
    expect(g.flatMap((d) => d.classes).length).toBe(3);
  });
  it("parses times and weekdays without timezone drift", () => {
    expect(minutes("09:05:00")).toBe(545);
    expect(minutes("25:00")).toBeNull();
    expect(dayOfWeek("2026-11-14")).toBe(6); // Saturday
    expect(dayOfWeek("2026-11-15")).toBe(0); // Sunday
  });
  it("seat grid marks filled, free and over-capacity seats", () => {
    expect(seatGrid(4, 2)).toEqual({ cols: 2, seats: ["filled", "filled", "free", "free"] });
    expect(seatGrid(2, 3).seats).toEqual(["filled", "filled", "over"]);
    expect(seatGrid(null, 0).seats).toEqual(["free"]);
  });
});
