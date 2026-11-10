import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace } from "@/lib/cr360/access";
import { businessDate, dict, formatDateTime } from "@/lib/cr360/i18n";
import { Unauthorized, Planned } from "@/components/cr360/Blocks";
import { BranchChart, type BranchRow } from "@/components/cr360/BranchChart";
import { computeCeoKpis } from "@/lib/cr360/kpis";
import { fetchAllPages } from "@/lib/cr360/paging";

export const dynamic = "force-dynamic";

/**
 * CEO overview built from EXISTING legacy Records tables (read-only, as the signed-in user).
 * No invented numbers: every figure is a count of real rows, stamped with the query time.
 * Money is shown separately on /360/finance with an explicit "not reconciled" label, because legacy
 * amounts are `numeric` with per-row rates and no payment allocation (a payments ledger is not yet drafted).
 */
export default async function CeoPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "ceo")) return <Unauthorized t={t} />;
  const sb = await supabaseServer();
  const today = businessDate();

  type R<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
  type Pkg = { id: string; branch_id: string | null; sessions_total: number | null; sessions_used: number | null; active: boolean | null };
  type Row = { id: string; branch_id: string | null; status: string | null };
  const [branches, pkgs, att, leads, inv] = await Promise.all([
    sb.from("branches").select("id,name,active").order("name"),
    fetchAllPages<Pkg>((f, t2) => sb.from("student_packages").select("id,branch_id,sessions_total,sessions_used,active").order("id").range(f, t2) as unknown as R<Pkg>),
    fetchAllPages<{ id: string; status: string | null }>((f, t2) => sb.from("attendance").select("id,status").eq("date", today).order("id").range(f, t2) as unknown as R<{ id: string; status: string | null }>),
    fetchAllPages<Row>((f, t2) => sb.from("leads").select("id,branch_id,status").order("id").range(f, t2) as unknown as R<Row>),
    fetchAllPages<Row>((f, t2) => sb.from("invoices").select("id,branch_id,status").order("id").range(f, t2) as unknown as R<Row>),
  ]);
  const asOf = new Date().toISOString();
  const errors = (branches.error ? 1 : 0) + [pkgs, att, leads, inv].filter((r) => r.error || r.truncated).length;

  const k = computeCeoKpis({
    branches: branches.data ?? [], packages: pkgs.rows, attendanceToday: att.rows,
    leads: leads.rows, invoices: inv.rows,
  });
  const rows: BranchRow[] = k.byBranch;

  return (
    <>
      <h1 className="cr-h1">{t.ws_ceo}</h1>
      <p className="cr-sub">{t.asOf} {formatDateTime(asOf, ctx.locale)} · {t.sourceNote}</p>
      {errors > 0 && <div className="cr-banner bad">{t.err_server_error} ({errors})</div>}

      <section className="cr-kpis" aria-label={t.kpis}>
        <Kpi label={t.activePackages} value={k.activePackages} />
        <Kpi label={t.lowSessions} value={k.lowSessions} />
        <Kpi label={t.attendanceToday} value={k.presentToday} />
        <Kpi label={t.openLeads} value={k.openLeads} />
        <Kpi label={t.unpaidInvoices} value={k.unpaidInvoices} />
      </section>

      <div className="cr-grid c2" style={{ marginTop: 14 }}>
        <section className="cr-card" aria-labelledby="bb-h">
          <h2 id="bb-h">{t.byBranch}</h2>
          <BranchChart rows={rows} labels={{ active: t.activePackages, low: t.lowSessions, leads: t.openLeads }} />
          <div className="cr-tablewrap">
            <table className="cr-table">
              <thead><tr><th scope="col">Branch</th><th scope="col">{t.activePackages}</th><th scope="col">{t.lowSessions}</th><th scope="col">{t.openLeads}</th><th scope="col">{t.unpaidInvoices}</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.branch}><td>{r.branch}</td><td>{r.active}</td><td>{r.low}</td><td>{r.leads}</td><td>{r.unpaid}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <Planned t={t} title="Reconciled revenue, cash & approvals inbox" phase="Phase 1b / 4"
          blockers={["Payments ledger migration, not yet drafted (invoice → payment → package credit, minor units, rate snapshots)", "Unified approvals inbox (0004 covers HR requests only)", "P0 legacy security fixes (0001/0002) approved & applied"]} />
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="cr-card cr-kpi"><div className="lbl">{label}</div><div className="val">{value.toLocaleString()}</div></div>
  );
}
