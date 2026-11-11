import { MediaInput } from "@/lib/cr360/schemas";
import { MEDIA_BUCKET } from "@/lib/cr360/media-rules";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/media — register a file the browser already uploaded to the private bucket, or
 * share / unshare / remove it. Files never pass through this server. All rules are in 0016.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, MediaInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  if (b.action === "register") {
    if ((b.kind === "photo") !== (b.mime === "image/jpeg")) return jsonError(400, "validation");
    const { data, error } = await sb.rpc("cr360_media_register", {
      p_path: b.path, p_kind: b.kind, p_mime: b.mime, p_bytes: b.bytes, p_duration: b.durationS ?? null, p_caption: b.caption ?? null, p_tagged: b.tagged,
    });
    if (error) {
      // the upload exists but cannot be registered: remove it so no orphan file stays in storage
      await sb.storage.from(MEDIA_BUCKET).remove([b.path]).catch(() => undefined);
      const e = rpcErrorCode(error);
      return jsonError(error.code === "23514" ? 409 : e.status, error.code === "23514" ? "media_limit" : e.code);
    }
    return jsonOk({ id: data }, 201);
  }
  const { data, error } = await sb.rpc("cr360_media_decide", { p_id: b.id, p_action: b.action, p_reason: b.reason ?? null });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, error.code === "22023" && b.action === "share" ? "media_no_consent" : e.code); }
  if (b.action === "remove") {
    // Only a branch manager / CEO may delete the file (storage policy); for a teacher it stays hidden until then.
    const { data: row } = await sb.from("cr360_class_media").select("storage_path").eq("id", b.id).maybeSingle();
    if (row?.storage_path) await sb.storage.from(MEDIA_BUCKET).remove([row.storage_path]).catch(() => undefined);
  }
  return jsonOk({ status: data });
}
