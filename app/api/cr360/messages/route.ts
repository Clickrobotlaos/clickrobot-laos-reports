import { MessageInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/messages — start / send / read / close. In-app only; who may do what is decided in 0018. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, MessageInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const r = b.action === "start" ? await sb.rpc("cr360_thread_start", { p_student_code: b.studentCode, p_subject: b.subject, p_body: b.body })
    : b.action === "send" ? await sb.rpc("cr360_message_send", { p_thread: b.threadId, p_body: b.body })
    : b.action === "read" ? await sb.rpc("cr360_thread_mark_read", { p_thread: b.threadId })
    : await sb.rpc("cr360_thread_close", { p_thread: b.threadId });
  if (r.error) {
    if (r.error.code === "54000") return jsonError(429, "too_many_messages");
    const e = rpcErrorCode(r.error); return jsonError(e.status, e.code);
  }
  return jsonOk({ result: r.data }, b.action === "start" ? 201 : 200);
}
