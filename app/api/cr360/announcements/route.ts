import { AnnouncementInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/announcements — save (and optionally publish) or publish/withdraw. In-app only; nothing is sent externally. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, AnnouncementInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  if (b.action === "save") {
    const { data: id, error } = await sb.rpc("cr360_announcement_save", {
      p_id: b.id ?? null, p_branch: b.branchId, p_audience: b.audience, p_title_en: b.titleEn, p_title_lo: b.titleLo ?? null,
      p_body_en: b.bodyEn, p_body_lo: b.bodyLo ?? null, p_from: b.showFrom, p_until: b.showUntil,
    });
    if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
    if (b.publish) {
      const p = await sb.rpc("cr360_announcement_status", { p_id: id, p_action: "publish" });
      if (p.error) { const e = rpcErrorCode(p.error); return jsonError(e.status, e.code); }
    }
    return jsonOk({ id, status: b.publish ? "published" : "draft" }, 201);
  }
  const { data, error } = await sb.rpc("cr360_announcement_status", { p_id: b.id, p_action: b.action });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: data });
}
