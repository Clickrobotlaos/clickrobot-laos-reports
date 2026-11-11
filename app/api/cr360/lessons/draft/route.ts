import { DraftReportsInput } from "@/lib/cr360/schemas";
import { buildDraftRequest, templateReport, type Draft, type StudentInput } from "@/lib/cr360/reports";
import { draftReportsWithAI } from "@/lib/cr360/ai-reports";
import { roster } from "@/lib/cr360/rollcall";
import { classAccess } from "@/lib/cr360/lesson-access";
import { loadRollCallData } from "@/lib/cr360/legacy-rollcall";
import { allow } from "@/lib/cr360/rate-limit";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/lessons/draft — DRAFT parent reports (nothing is saved or sent).
 * mode "template": deterministic text, no AI. mode "ai": Claude, with names removed on the server.
 * The class, the booked students, their names and attendance are always re-read on the server.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, DraftReportsInput);
  if (!body.ok) return body.res;
  const b = body.data;

  const sb = await supabaseServer();
  const { cls, canWrite } = await classAccess(sb, ctx.viewer, b.classId);
  if (!cls || !canWrite) return jsonError(404, "not_found");

  const data = await loadRollCallData(sb, [cls.id], b.date);
  if (data.error) return jsonError(500, "server_error");
  const booked = new Map(roster(cls, data.bookings, data.packages, data.attendance, b.date).map((e) => [e.packageId, e]));
  const students: StudentInput[] = b.students.filter((s) => booked.has(s.packageId)).map((s) => {
    const e = booked.get(s.packageId)!;
    return { packageId: s.packageId, name: e.name, rubric: s.rubric, teacherNote: s.teacherNote ?? null, attendance: e.status };
  });
  if (students.length === 0) return jsonError(422, "not_booked");
  const lesson = { unit: b.lesson.unit ?? null, lesson_title: b.lesson.lessonTitle, level: b.lesson.level ?? null, covered: b.lesson.covered ?? null, next_plan: b.lesson.nextPlan ?? null };

  if (b.mode === "template") {
    const drafts: Record<string, Draft> = {};
    for (const s of students) drafts[s.packageId] = templateReport(lesson, s.rubric, s.attendance);
    return jsonOk({ status: "drafted", source: "template", drafts });
  }

  if (!allow(`ai-draft:${ctx.viewer.userId}`, 20, 10 * 60_000)) return jsonError(429, "ai_busy");
  // Every child's name in the class (not only the selected ones) is scrubbed from all text.
  const allNames = [...booked.values()].map((e) => e.name);
  const r = await draftReportsWithAI(buildDraftRequest(lesson, students, allNames), allNames);
  if (!r.ok) return jsonError(r.code === "ai_not_configured" ? 503 : r.code === "ai_busy" ? 429 : r.code === "privacy_block" ? 422 : 502, r.code);
  return jsonOk({ status: "drafted", source: "ai_draft", drafts: r.drafts });
}
