import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace, studentBranchScope } from "@/lib/cr360/access";
import { businessDate, dict, type DictKey } from "@/lib/cr360/i18n";
import { funnel, slaFlag, STAGES, type Lead } from "@/lib/cr360/crm";
import { loadNames } from "@/lib/cr360/legacy-students";
import { Unauthorized } from "@/components/cr360/Blocks";
import { LeadActions } from "@/components/cr360/LeadActions";
import { fetchAllPages } from "@/lib/cr360/paging";

export const dynamic = "force-dynamic";

/** Kanban over legacy leads, branch-scoped on the server (leads without a branch are CEO-only). */
export default async function CrmPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "crm")) return <Unauthorized t={t} />;
  const scope = studentBranchScope(ctx.viewer);
  const sb = await supabaseServer();
  const [res, names] = await Promise.all([
    fetchAllPages<Lead>((from, to) => {
      let q = sb.from("leads").select("id,student_name,parent_name,phone,age,branch_id,program_id,source,status,lost_reason,trial_date,last_contact_at,created_at").order("id");
      if (scope !== null) q = q.in("branch_id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
      return q.range(from, to) as unknown as PromiseLike<{ data: Lead[] | null; error: unknown }>;
    }),
    loadNames(sb),
  ]);
  const error = res.error || res.truncated;
  const leads = [...res.rows].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const f = funnel(leads);
  const now = new Date(), today = businessDate(now);
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

  return (
    <>
      <h1 className="cr-h1">{t.ws_crm}</h1>
      <p style={{ margin: "4px 0 10px" }}><a className="cr-btn ghost" href="/360/crm/growth" style={{ minHeight: 40 }}>📈 {t.growth}</a></p>
      <p className="cr-sub">{t.crmSub} {scope === null ? t.scopeAll : t.scopeBranch}</p>
      {error && <div className="cr-banner bad">{t.err_server_error}</div>}

      <section className="cr-kpis" aria-label={t.kpis}>
        <div className="cr-card cr-kpi"><div className="lbl">{t.openLeads}</div><div className="val">{f.by.New + f.by.Contacted + f.by.TrialBooked + f.by.TrialAttended}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.trialRate}</div><div className="val">{pct(f.trialRate)}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.winRate}</div><div className="val">{pct(f.winRate)}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.stage_Registered}</div><div className="val">{f.by.Registered}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.stage_Lost}</div><div className="val">{f.by.Lost}</div></div>
      </section>
      <p style={{ margin: "12px 0" }}><Link href="/leads" className="cr-btn ghost">{t.openInRecords} ↗</Link></p>

      {leads.length === 0 ? <div className="cr-card"><p>{t.noLeads}</p></div> : (
        <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(250px, 1fr)", gap: 12, overflowX: "auto", paddingBottom: 8 }} role="list" aria-label={t.ws_crm}>
          {STAGES.map((s) => {
            const col = leads.filter((l) => l.status === s);
            return (
              <section key={s} role="listitem" aria-labelledby={`st-${s}`} className="cr-card" style={{ padding: 12, background: "var(--c-surface2)" }}>
                <h2 id={`st-${s}`} style={{ fontSize: 14, display: "flex", justifyContent: "space-between" }}>{t[`stage_${s}` as DictKey]} <span className="cr-badge">{col.length}</span></h2>
                {col.map((l) => {
                  const flag = slaFlag(l, now, today);
                  return (
                    <article key={l.id} className="cr-slot" style={{ fontSize: 14 }}>
                      <b>{l.student_name}{l.age ? <span className="cr-muted"> · {t.age} {l.age}</span> : null}</b>
                      <div className="cr-muted">{l.parent_name ?? "—"}{l.phone ? <> · <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}>{l.phone}</a></> : null}</div>
                      <div className="cr-muted">{names.branch.get(l.branch_id ?? "") ?? "—"}{l.program_id ? ` · ${names.program.get(l.program_id) ?? ""}` : ""}{l.source ? ` · ${l.source}` : ""}</div>
                      {l.trial_date && s === "TrialBooked" && <div className="cr-muted">{t.trialOn}: {l.trial_date}</div>}
                      {s === "Lost" && l.lost_reason && <div className="cr-muted">{l.lost_reason}</div>}
                      {flag && <span className="cr-badge pending" style={{ marginTop: 6 }}>{t[`sla_${flag}` as DictKey]}</span>}
                      <LeadActions leadId={l.id} status={l.status} t={t} />
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
