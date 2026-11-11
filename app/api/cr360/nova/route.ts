import { NovaInput } from "@/lib/cr360/schemas";
import { aiStatus } from "@/lib/cr360/ai-reports";
import { askNova, buildNovaRequest } from "@/lib/cr360/nova";
import { allow } from "@/lib/cr360/rate-limit";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/nova — a verified parent asks about their own child's learning.
 * Gates: AI switched on by the owner (aiStatus), the child is one of this parent's verified children,
 * AI consent for that child (0013; any guardian's withdrawal wins), 10 questions / 10 min.
 * Only teacher-approved information is used; names and contact/ID details are removed; nothing is stored.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, NovaInput);
  if (!body.ok) return body.res;
  const { studentCode, question } = body.data;
  const child = ctx.guardianChildren.filter((c) => c.student_code === studentCode);
  if (child.length === 0) return jsonError(404, "not_found");
  const status = aiStatus();
  if (!status.ready) return jsonError(503, "ai_not_configured");
  if (!allow(`nova:${ctx.viewer.userId}`, 10, 10 * 60_000)) return jsonError(429, "ai_busy");

  const sb = await supabaseServer();
  const ok = await sb.rpc("cr360_guardian_ai_allowed", { p_student_code: studentCode });
  if (ok.error || ok.data !== true) return jsonError(403, "ai_no_consent");

  const [rep, sch, ach] = await Promise.all([
    sb.rpc("cr360_guardian_reports", { p_student_code: studentCode }),
    sb.rpc("cr360_guardian_schedule", { p_student_code: studentCode }),
    sb.rpc("cr360_guardian_achievements", { p_student_code: studentCode }),
  ]);
  const lo = ctx.locale === "lo";
  const reports = ((rep.error ? [] : rep.data ?? []) as { lesson_date: string; lesson_title: string; report_en: string | null; report_lo: string | null }[])
    .map((r) => ({ date: r.lesson_date, lesson: r.lesson_title, text: (lo ? r.report_lo ?? r.report_en : r.report_en ?? r.report_lo) ?? "" })).filter((r) => r.text);
  const upcoming = ((sch.error ? [] : sch.data ?? []) as { class_date: string; start_time: string; class_name: string }[])
    .map((u) => ({ date: u.class_date, time: String(u.start_time).slice(0, 5), className: u.class_name }));
  const achievements = ((ach.error ? [] : ach.data ?? []) as { awarded_on: string; title_en: string; title_lo: string | null }[])
    .map((a) => ({ date: a.awarded_on, title: lo && a.title_lo ? a.title_lo : a.title_en }));
  const left = child.filter((c) => c.active).reduce((n, c) => n + Math.max(0, (c.sessions_total ?? 0) - (c.sessions_used ?? 0)), 0);
  const childName = child[0].student_name;

  const request = buildNovaRequest({ childName, otherNames: [], program: child[0].program_name, sessionsLeft: left, reports, upcoming, achievements }, question);
  const r = await askNova(request, [childName], status);
  if (!r.ok) return jsonError(r.code === "ai_not_configured" ? 503 : r.code === "ai_busy" ? 429 : r.code === "privacy_block" ? 422 : 502, r.code);
  return jsonOk({ answer: r.answer });
}
