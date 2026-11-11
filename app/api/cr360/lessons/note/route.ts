import { StudentNoteInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/lessons/note — save one student's rubric, private note and parent report (stays draft). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, StudentNoteInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_student_note_save", {
    p_log: b.logId, p_package: b.packageId, p_rubric: b.rubric, p_teacher_note: b.teacherNote ?? null,
    p_report_en: b.reportEn ?? null, p_report_lo: b.reportLo ?? null, p_source: b.source,
  });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "draft_saved", noteId: data });
}
