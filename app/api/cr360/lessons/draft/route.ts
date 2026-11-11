import { DraftReportsInput } from "@/lib/cr360/schemas";
import { buildDraftRequest, templateReport, type Draft, type StudentInput } from "@/lib/cr360/reports";
import { aiStatus, draftReportsWithAI } from "@/lib/cr360/ai-reports";
import { roster } from "@/lib/cr360/rollcall";
import { classAccess } from "@/lib/cr360/lesson-access";
import { loadRollCallData } from "@/lib/cr360/legacy-rollcall";
import { allow } from "@/lib/cr360/rate-limit";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/lessons/draft — DRAFT parent reports (nothing is saved or sent).
 * mode "template": deterministic text, no AI.
 * mode "ai": only when the owner has switched AI on (aiStatus) AND, per child, a verified guardian has
 * given AI consent (0013, decision D). Children without consent are left out of the AI request and
 * reported as `skipped` (the teacher uses the template for them). Names, guardian names and contact /
 * ID details are removed on the server before anything is sent.
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

  const status = aiStatus();
  if (!status.ready) return jsonError(503, "ai_not_configured");
  if (!allow(`ai-draft:${ctx.viewer.userId}`, 20, 10 * 60_000)) return jsonError(429, "ai_busy");

  // Consent per child (0013). Missing function / error = nobody consented (fail closed).
  const codeOf = new Map(data.packages.map((p) => [p.id, p.student_id ?? null]));
  const codes = [...new Set(students.map((s) => codeOf.get(s.packageId)).filter((c): c is string => !!c))];
  const { data: consentRows, error: cErr } = codes.length
    ? await sb.rpc("cr360_student_consent_ok", { p_codes: codes, p_purpose: "ai_reports" })
    : { data: [], error: null };
  const okCodes = new Set(cErr ? [] : ((consentRows ?? []) as { student_code: string; ok: boolean }[]).filter((r) => r.ok).map((r) => r.student_code));
  const allowed = students.filter((s) => okCodes.has(codeOf.get(s.packageId) ?? ""));
  const skipped = students.filter((s) => !allowed.includes(s)).map((s) => s.packageId);
  if (allowed.length === 0) return jsonError(422, "ai_no_consent", { skipped });

  // Every child's name in the class and every guardian name is scrubbed from all text.
  const allNames = [...booked.values()].map((e) => e.name);
  const guardianNames = data.packages.map((p) => p.parent_name ?? "").filter((n) => n.trim().length >= 2);
  const knownNames = [...allNames, ...guardianNames];
  const r = await draftReportsWithAI(buildDraftRequest(lesson, allowed, knownNames), knownNames, undefined, status);
  if (!r.ok) return jsonError(r.code === "ai_not_configured" ? 503 : r.code === "ai_busy" ? 429 : r.code === "privacy_block" ? 422 : 502, r.code);
  return jsonOk({ status: "drafted", source: "ai_draft", drafts: r.drafts, skipped });
}
