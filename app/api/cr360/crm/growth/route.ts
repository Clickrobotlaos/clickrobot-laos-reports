import { GrowthInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/crm/growth — campaigns, lead attribution, referral rewards. Rules in 0021. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, GrowthInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const call = () => {
    switch (b.action) {
      case "campaign": return sb.rpc("cr360_campaign_save", { p_id: b.id ?? null, p_name: b.name, p_channel: b.channel, p_branch: b.branchId, p_from: b.from, p_to: b.to, p_budget: b.budget, p_spent: b.spent });
      case "attribute": return sb.rpc("cr360_lead_attribute", { p_lead: b.leadId, p_campaign: b.campaignId ?? null, p_referrer: b.referrer ?? null });
      default: return sb.rpc("cr360_referral_reward", { p_lead: b.leadId, p_action: b.action, p_text: b.text ?? null });
    }
  };
  const r = await call();
  if (r.error) { const e = rpcErrorCode(r.error); return jsonError(e.status, e.code); }
  return jsonOk({ result: r.data });
}
