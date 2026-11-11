import { LessonLogInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/lessons/save — upsert the class's lesson log for a day (migration 0010 enforces who/when). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, LessonLogInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_lesson_log_save", {
    p_class: b.classId, p_date: b.date, p_unit: b.unit ?? null, p_lesson_title: b.lessonTitle, p_level: b.level ?? null,
    p_covered: b.covered ?? null, p_next_plan: b.nextPlan ?? null, p_substitute_notes: b.substituteNotes ?? null,
  });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "saved", logId: data });
}
