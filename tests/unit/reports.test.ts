import { describe, expect, it } from "vitest";
import { buildDraftRequest, containsAnyName, isValidRubric, mapDrafts, scrubNames, templateReport, type LessonInfo } from "@/lib/cr360/reports";

// FICTIONAL names and lessons.
const lesson: LessonInfo = { unit: "Unit 3: Sensors", lesson_title: "Line follower", level: "Spike Prime L2", covered: "Noy and Bounmy calibrated sensors", next_plan: "Speed control" };
const students = [
  { packageId: "p1", name: "Noy Phommasak", rubric: { programming: 4 as const, teamwork: 2 as const }, teacherNote: "Noy helped Bounmy debug; NOY was very patient", attendance: "Present" as const },
  { packageId: "p2", name: "ບຸນມີ ສີສະຫວາດ", rubric: {}, teacherNote: "ບຸນມີ ມາຊ້າ", attendance: "Present" as const },
  { packageId: "p3", name: "Bounmy K.", rubric: {}, teacherNote: null, attendance: "Absent" as const },
];

describe("de-identification before AI", () => {
  it("removes full names, first/last names, any case, Lao and Latin script", () => {
    expect(scrubNames("Noy helped Bounmy; NOY smiled", ["Noy Phommasak", "Bounmy K."])).toBe("[child] helped [child]; [child] smiled");
    expect(scrubNames("ບຸນມີ ມາຊ້າ", ["ບຸນມີ ສີສະຫວາດ"])).toBe("[child] ມາຊ້າ");
    expect(scrubNames(null, ["x"])).toBeNull();
  });
  it("short Latin names match whole words only (no damage to ordinary words)", () => {
    expect(scrubNames("An and Ann planned; an AN", ["An"])).toBe("[child] and Ann planned; [child] [child]");
  });
  it("request carries refs only — no name, no package id — and scrubs other children's names too", () => {
    const req = buildDraftRequest(lesson, students);
    const sent = JSON.stringify({ lesson: req.lesson, students: req.students });
    for (const s of students) {
      expect(containsAnyName(sent, [s.name])).toBe(false);
      expect(sent).not.toContain(s.packageId);
    }
    expect(req.students.map((s) => s.ref)).toEqual(["S1", "S2", "S3"]);
    expect(req.refs).toEqual({ S1: "p1", S2: "p2", S3: "p3" });
    expect(req.lesson.covered).toBe("[child] and [child] calibrated sensors");
  });
  it("also scrubs classmates who are not in this batch", () => {
    const req = buildDraftRequest(lesson, [students[0]], ["Bounmy K.", "ບຸນມີ ສີສະຫວາດ"]);
    expect(req.students[0].teacher_note).toBe("[child] helped [child] debug; [child] was very patient");
  });
});

describe("AI output mapping", () => {
  it("maps refs back, ignores unknown/duplicate refs and empty drafts, caps length", () => {
    const m = mapDrafts([
      { ref: "S1", en: "Great job.", lo: "ເກັ່ງຫຼາຍ." },
      { ref: "S1", en: "dup", lo: "dup" },
      { ref: "S9", en: "unknown", lo: "x" },
      { ref: "S2", en: "  ", lo: "" },
      { ref: "S3", en: "x".repeat(5000), lo: "" },
    ], { S1: "p1", S2: "p2", S3: "p3" });
    expect(Object.keys(m).sort()).toEqual(["p1", "p3"]);
    expect(m.p1).toEqual({ en: "Great job.", lo: "ເກັ່ງຫຼາຍ." });
    expect(m.p3.en.length).toBe(3000);
  });
});

describe("template report (no AI)", () => {
  it("present: mentions lesson, strengths, practice areas and next class in both languages", () => {
    const d = templateReport(lesson, { programming: 4, teamwork: 2 }, "Present");
    expect(d.en).toContain("Line follower");
    expect(d.en).toContain("strength in programming");
    expect(d.en).toContain("practising teamwork");
    expect(d.en).toContain("Next class: Speed control");
    expect(d.lo).toContain("ລູກຂອງທ່ານ");
    expect(d.lo).toContain("ການຂຽນໂປຣແກຣມ");
  });
  it("absent: a catch-up message, no skill claims", () => {
    const d = templateReport(lesson, { programming: 4 }, "Absent");
    expect(d.en).toContain("missed today's class");
    expect(d.en).not.toContain("strength");
  });
  it("rubric validation mirrors the database rule", () => {
    expect(isValidRubric({ programming: 3 })).toBe(true);
    expect(isValidRubric({ programming: 5 })).toBe(false);
    expect(isValidRubric({ charisma: 2 })).toBe(false);
    expect(isValidRubric([])).toBe(false);
  });
});
