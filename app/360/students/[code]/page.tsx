import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canAccessBranch, canUseWorkspace, studentBranchScope } from "@/lib/cr360/access";
import { dict, formatDateTime } from "@/lib/cr360/i18n";
import { reconcilePackage } from "@/lib/cr360/students";
import { loadAttendanceFor, loadNames, loadScopedPackages } from "@/lib/cr360/legacy-students";
import { Unauthorized } from "@/components/cr360/Blocks";
import { GuardianPanel, type LinkRow } from "@/components/cr360/GuardianPanel";
import { guardianConsentVersion } from "@/lib/cr360/guardian-admin";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Student detail. IDOR defence: rows are fetched already filtered to the viewer's branch scope, and
 * every package is re-checked with canAccessBranch. "Not found" and "other branch" render the same
 * message so a guessed code reveals nothing.
 */
export default async function StudentDetail({ params }: { params: Promise<{ code: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "students")) return <Unauthorized t={t} />;
  // Next 16 passes dynamic params still URL-encoded (verified), so decode exactly once; malformed → not found.
  let code = "";
  try { code = decodeURIComponent((await params).code).slice(0, 80); } catch { code = ""; }

  const where = !code ? null : code.startsWith("pkg:")
    ? (UUID.test(code.slice(4)) ? { packageId: code.slice(4) } : null)
    : { studentCode: code };
  const sb = await supabaseServer();
  const scope = studentBranchScope(ctx.viewer);
  const { packages: raw } = where ? await loadScopedPackages(sb, scope, where) : { packages: [] };
  const packages = raw.filter((p) => p.branch_id && canAccessBranch(ctx.viewer, p.branch_id));

  const notFound = (
    <>
      <Link href="/360/students" className="cr-muted">← {t.back}</Link>
      <div className="cr-card" role="alert" style={{ marginTop: 12 }}><h2>{t.notFoundOrNoAccess}</h2></div>
    </>
  );
  if (packages.length === 0) return notFound;

  const realCode = !code.startsWith("pkg:");
  const [{ rows: att }, names, linkRes] = await Promise.all([
    loadAttendanceFor(sb, packages.map((p) => p.id)),
    loadNames(sb),
    realCode ? sb.rpc("cr360_guardian_links_for", { p_student_code: code }) : Promise.resolve({ data: null, error: null }),
  ]);
  const linksEnabled = realCode && !(linkRes.error && rpcErrorCode(linkRes.error).code === "not_enabled");
  const links = (linkRes.data ?? []) as LinkRow[];
  const name = [...packages].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0].student_name;

  return (
    <>
      <Link href="/360/students" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>{name}</h1>
      <p className="cr-sub">{code.startsWith("pkg:") ? "" : `${t.colCode}: ${code}`}</p>
      <div className="cr-banner info">{t.legacyReadNote}</div>

      <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="pa-h">
        <h2 id="pa-h">{t.parentAccess}</h2>
        {!realCode ? <p className="cr-muted">—</p>
          : !linksEnabled ? <div className="cr-banner info">{t.guardianNotEnabled}</div>
          : linkRes.error ? <div className="cr-banner bad">{t.err_server_error}</div>
          : <GuardianPanel studentCode={code} links={links} consentVersion={guardianConsentVersion()} t={t} />}
      </section>

      {packages.map((p) => {
        const r = reconcilePackage(p, att);
        const rows = att.filter((a) => a.package_id === p.id).sort((a, b) => b.date.localeCompare(a.date));
        return (
          <section key={p.id} className="cr-card" style={{ marginTop: 14 }} aria-label={p.package ?? t.colPackages}>
            <h2>
              {names.program.get(p.program_id ?? "") ?? "—"} · {p.package ?? "—"}{" "}
              <span className="cr-badge">{p.active ? (p.student_status ?? "Active") : t.filterInactive}</span>
            </h2>
            <p className="cr-muted">{names.branch.get(p.branch_id ?? "") ?? "—"} · {t.startDate}: {p.start_date ?? "—"}</p>

            <div className="cr-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <div className="cr-card cr-kpi"><div className="lbl">{t.colRemaining}</div><div className="val">{r.remaining}</div></div>
              <div className="cr-card cr-kpi"><div className="lbl">{t.total}</div><div className="val">{r.total}</div></div>
              <div className="cr-card cr-kpi"><div className="lbl">{t.derivedFromAttendance}</div><div className="val">{r.derivedUsed}</div></div>
              <div className="cr-card cr-kpi"><div className="lbl">{t.storedCounter}</div><div className="val">{r.storedUsed}</div></div>
            </div>
            {r.mismatch && <div className="cr-banner bad" role="status">{t.reconcileHint}</div>}
            {r.overdrawn && <div className="cr-banner bad" role="status">{t.overdrawn}</div>}
            {!r.mismatch && !r.overdrawn && r.remaining <= 2 && p.active && <div className="cr-banner warn">{t.lowBalanceBanner}</div>}

            <div className="cr-grid c2" style={{ marginTop: 12 }}>
              <div>
                <h3 style={{ fontSize: 15 }}>{t.ledger}</h3>
                <div className="cr-tablewrap">
                  <table className="cr-table">
                    <thead><tr><th scope="col">{t.date}</th><th scope="col">{t.type}</th><th scope="col">±</th><th scope="col">{t.balanceAfter}</th></tr></thead>
                    <tbody>
                      {(() => {
                        let running = 0;
                        return r.lines.map((l, i) => {
                          if (l.kind === "credit") {
                            running += l.sessions;
                            return <tr key={`c${i}`}><td>{l.date ?? "—"}</td><td>{l.label === "base" ? t.base : t.bonus}</td><td>+{l.sessions}</td><td>{running}</td></tr>;
                          }
                          running = l.balanceAfter;
                          return <tr key={l.attendanceId}><td>{l.date}</td><td>{t.debit}{l.makeup ? ` (${t.makeup})` : ""}</td><td>−1</td><td>{l.balanceAfter}</td></tr>;
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: 15 }}>{t.attendanceHistory}</h3>
                {rows.length === 0 ? <p className="cr-muted">—</p> : (
                  <ul className="cr-list">{rows.map((a) => (
                    <li key={a.id}>
                      <span>{a.date}{a.is_makeup ? ` · ${t.makeup}` : ""}</span>
                      <span>
                        <span className={`cr-badge ${a.status === "Present" ? "approved" : "rejected"}`}>{a.status === "Present" ? t.present : t.absent}</span>
                        {a.created_at && <span className="cr-muted"> · {formatDateTime(a.created_at, ctx.locale)}</span>}
                      </span>
                    </li>
                  ))}</ul>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
