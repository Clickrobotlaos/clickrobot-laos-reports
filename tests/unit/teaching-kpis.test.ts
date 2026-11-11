import { describe, expect, it } from "vitest";
import { datesBetween, teachingKpis } from "@/lib/cr360/teaching-kpis";

// 2026-11-02 is a Monday (1). Class c1 (teacher T) on Mondays, c2 (teacher T) on Wednesdays, c3 inactive.
const classes = [
  { id: "c1", teacher_id: "T", day_of_week: 1, active: true },
  { id: "c2", teacher_id: "T", day_of_week: 3, active: true },
  { id: "c3", teacher_id: "U", day_of_week: 1, active: false },
  { id: "c4", teacher_id: null, day_of_week: 1, active: true },
];

describe("teaching indicators", () => {
  it("counts scheduled class-days from the timetable for the period only", () => {
    expect(datesBetween("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    const [k] = teachingKpis(classes, [], [], [], "2026-11-01", "2026-11-14");
    expect(k).toMatchObject({ teacherId: "T", scheduled: 4, rollCall: 0, logged: 0, rollCallPct: 0, loggedPct: 0, approvedPct: null });
  });
  it("roll call, lesson logs and approved reports per scheduled day; inactive and unassigned classes ignored", () => {
    const att = [{ class_id: "c1", date: "2026-11-02" }, { class_id: "c1", date: "2026-11-02" }, { class_id: "c2", date: "2026-11-04" }, { class_id: null, date: "2026-11-09" }];
    const logs = [{ id: "L1", class_id: "c1", lesson_date: "2026-11-02" }, { id: "Lx", class_id: "c1", lesson_date: "2026-11-03" }];
    const notes = [{ lesson_log_id: "L1", status: "approved" }, { lesson_log_id: "L1", status: "draft" }, { lesson_log_id: "Lx", status: "approved" }];
    const r = teachingKpis(classes, att, logs, notes, "2026-11-01", "2026-11-14");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ scheduled: 4, rollCall: 2, logged: 1, notes: 2, approved: 1, rollCallPct: 50, loggedPct: 25, approvedPct: 50 });
  });
  it("nothing scheduled → no percentages", () => {
    const [k] = teachingKpis(classes, [], [], [], "2026-11-05", "2026-11-06");
    expect(k).toMatchObject({ scheduled: 0, rollCallPct: null, loggedPct: null });
  });
});
