import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { hasRole, studentBranchScope } from "@/lib/cr360/access";
import { businessDate, dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { AttributeForm, CampaignForm, RewardList, type RewardLead } from "@/components/cr360/Growth";

export const dynamic = "force-dynamic";

/** Campaign results, lead attribution and referral rewards (0021). Managers: own branch; CEO: all. */
export default async function GrowthPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !hasRole(ctx.viewer, ["ceo", "manager"])) return <Unauthorized t={t} />;
  const isCeo = hasRole(ctx.viewer, ["ceo"]);
  const scope = studentBranchScope(ctx.viewer);
  const sb = await supabaseServer();
  const today = businessDate();
  const from = new Date(Date.parse(today + "T00:00:00Z") - 90 * 864e5).toISOString().slice(0, 10);
  const [rep, board, br, camps, leadRes, attr, rewards] = await Promise.all([
    sb.rpc("cr360_campaign_report", { p_from: from, p_to: today }),
    sb.rpc("cr360_referral_board"),
    sb.from("branches").select("id,name").eq("active", true).order("name"),
    sb.from("cr360_campaigns").select("id,name,branch_id,ends_on").order("starts_on", { ascending: false }).limit(50),
    sb.from("leads").select("id,student_name,status,branch_id,created_at").order("created_at", { ascending: false }).limit(200),
    sb.from("cr360_lead_attribution").select("lead_id,referrer_student_code").not("referrer_student_code", "is", null).limit(1000),
    sb.from("cr360_referral_rewards").select("lead_id,status").limit(1000),
  ]);
  if (rep.error) return (<><h1 className="cr-h1">{t.growth}</h1><div className="cr-banner info">{t.growthNotEnabled}</div></>);
  const branches = ((br.data ?? []) as { id: string; name: string }[]).filter((b) => isCeo || (scope ?? []).includes(b.id));
  const inScope = (b: string | null) => isCeo || (!!b && (scope ?? []).includes(b));
  const leads = ((leadRes.data ?? []) as { id: string; student_name: string; status: string; branch_id: string | null }[]).filter((l) => inScope(l.branch_id));
  const referrerOf = new Map(((attr.data ?? []) as { lead_id: string; referrer_student_code: string }[]).map((a) => [a.lead_id, a.referrer_student_code]));
  const rewardOf = new Map(((rewards.data ?? []) as { lead_id: string; status: string }[]).map((r) => [r.lead_id, r.status]));
  const due: RewardLead[] = leads.filter((l) => l.status === "Registered" && referrerOf.has(l.id) && rewardOf.get(l.id) !== "given" && rewardOf.get(l.id) !== "declined")
    .map((l) => ({ leadId: l.id, leadName: l.student_name, referrer: referrerOf.get(l.id)!, status: rewardOf.get(l.id) ?? null }));
  const report = (rep.data ?? []) as { campaign_id: string; name: string; channel: string; spent_lak: number; leads: number; trials: number; registered: number; cost_per_lead: number | null; cost_per_registration: number | null }[];
  const n = (v: number | null) => (v === null ? "—" : Number(v).toLocaleString());
  return (
    <>
      <Link href="/360/crm" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>📈 {t.growth}</h1>
      <p className="cr-sub">{t.growthNote}</p>
      <div className="cr-grid" style={{ gap: 14 }}>
        <section className="cr-card"><h2>{t.campaignResults}</h2>
          {report.length === 0 ? <p className="cr-muted">—</p> : (
            <div className="cr-tablewrap"><table className="cr-table">
              <thead><tr><th scope="col">{t.campaign}</th><th scope="col">{t.leadsLbl}</th><th scope="col">{t.trialsLbl}</th><th scope="col">{t.registeredLbl}</th><th scope="col">{t.spentLak}</th><th scope="col">{t.costPerLead}</th><th scope="col">{t.costPerRegistration}</th></tr></thead>
              <tbody>{report.map((r) => <tr key={r.campaign_id}><td>{r.name} <span className="cr-muted">· {r.channel}</span></td><td>{r.leads}</td><td>{r.trials}</td><td>{r.registered}</td><td>{n(r.spent_lak)}</td><td>{n(r.cost_per_lead)}</td><td>{n(r.cost_per_registration)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className="cr-card"><h2>🎁 {t.referralRewards}</h2><RewardList rows={due} t={t} />
          <h3 style={{ marginTop: 14 }}>{t.topReferrers}</h3>
          <ul className="cr-list">{((board.data ?? []) as { referrer_student_code: string; referrer_name: string | null; leads: number; registered: number; rewards_given: number }[]).slice(0, 10).map((b) => (
            <li key={b.referrer_student_code}><span><b>{b.referrer_name ?? b.referrer_student_code}</b> <span className="cr-muted">· {b.referrer_student_code}</span></span><span>{b.registered}/{b.leads}</span></li>
          ))}</ul>
        </section>
        <section className="cr-card"><h2>{t.linkLead}</h2>
          <AttributeForm leads={leads.slice(0, 100).map((l) => ({ id: l.id, label: `${l.student_name} · ${l.status}` }))} campaigns={((camps.data ?? []) as { id: string; name: string; branch_id: string | null }[]).filter((c) => c.branch_id === null || inScope(c.branch_id))} t={t} />
        </section>
        <section className="cr-card"><h2>{t.newCampaign}</h2><CampaignForm branches={branches} allowAll={isCeo} t={t} /></section>
      </div>
    </>
  );
}
