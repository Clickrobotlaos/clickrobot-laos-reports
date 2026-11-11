import { AchievementInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/achievements — propose (teacher) or issue/decline/revoke (manager/CEO). Rules live in 0015. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, AchievementInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const { data, error } = b.action === "propose"
    ? await sb.rpc("cr360_achievement_propose", { p_package: b.packageId, p_kind: b.kind, p_title_en: b.titleEn, p_title_lo: b.titleLo ?? null, p_level: b.level ?? null, p_awarded_on: b.awardedOn, p_note: b.note ?? null })
    : await sb.rpc("cr360_achievement_decide", { p_id: b.id, p_action: b.action, p_reason: b.reason ?? null });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk(b.action === "propose" ? { id: data, status: "proposed" } : { status: data }, b.action === "propose" ? 201 : 200);
}
