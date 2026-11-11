import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { groupChildren } from "@/lib/cr360/parent";
import { Unauthorized } from "@/components/cr360/Blocks";
import { ParentRequests, type ParentRequestRow } from "@/components/cr360/ParentRequests";
import { supabaseServer } from "@/lib/cr360/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Guardian home. Data comes ONLY from public.cr360_guardian_children() (proposed migration 0005), which
 * returns children whose link is verified, consented and not revoked. No other table is queried, so a
 * guessed ?child= value can only select among the guardian's own children.
 */
export default async function ParentPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "parent")) return <Unauthorized t={t} />;

  const children = groupChildren(ctx.guardianChildren);
  if (children.length === 0) {
    return (<><h1 className="cr-h1">{t.ws_parent}</h1><div className="cr-card"><p>{t.noChildren}</p></div></>);
  }
  const wanted = (await searchParams).child;
  const current = children.find((c) => c.code === wanted) ?? children[0];
  const sb = await supabaseServer();
  // RLS returns only this guardian's own rows; table missing (0009 not applied) → error → disabled.
  const reqRes = await sb.from("cr360_guardian_requests").select("id,kind,start_date,end_date,message,status,review_note,created_at")
    .eq("student_code", current.code).order("created_at", { ascending: false }).limit(20);
  const requestsEnabled = !reqRes.error;
  // Approved class reports only (0010); missing function → section hidden.
  const repRes = await sb.rpc("cr360_guardian_reports", { p_student_code: current.code });
  const reports = (repRes.error ? null : (repRes.data ?? [])) as { lesson_date: string; class_name: string; unit: string | null; lesson_title: string; level: string | null; report_en: string | null; report_lo: string | null }[] | null;

  return (
    <>
      <h1 className="cr-h1">{t.ws_parent}</h1>
      <p className="cr-sub">{t.parentSub}</p>

      {children.length > 1 && (
        <nav className="cr-tabs" aria-label={t.colStudent}>
          {children.map((c) => (
            <Link key={c.code} href={`/360/parent?child=${encodeURIComponent(c.code)}`} aria-current={c.code === current.code ? "page" : undefined}
              className="cr-badge" style={{ padding: "8px 14px", textDecoration: "none", ...(c.code === current.code ? { background: "var(--c-ink)", color: "var(--c-surface)" } : {}) }}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <h2 style={{ fontSize: 20, margin: "8px 0 12px" }}>{current.name}</h2>
      <div className="cr-grid c2">
        {current.packages.map((p) => {
          const total = p.sessions_total ?? 0;
          const pct = total > 0 ? Math.max(0, Math.min(100, (p.left / total) * 100)) : 0;
          return (
            <section key={p.package_id} className="cr-card cr-kpi" aria-label={p.program_name ?? t.program}>
              <div className="lbl">{p.program_name ?? "—"} · {p.branch_name ?? "—"}</div>
              <div className="val">{p.left} <span className="cr-muted" style={{ fontSize: 15 }}>{t.of} {total}</span></div>
              <div className="cr-muted">{t.sessionsLeft}{p.package ? ` · ${p.package}` : ""}</div>
              <div className="cr-gauge" role="img" aria-label={`${t.sessionsLeft}: ${p.left} ${t.of} ${total}`}><span style={{ width: `${pct}%` }} /></div>
              {p.active && p.left <= 2 && <div className="cr-banner warn" style={{ marginTop: 10 }}>{t.lowBalance}</div>}
              {!p.active && <p className="cr-muted">{t.filterInactive}</p>}
              <p className="cr-muted">{t.startDate}: {p.start_date ?? "—"}</p>
            </section>
          );
        })}
      </div>
      <p className="cr-muted" style={{ marginTop: 12 }}>{t.balanceNote} {t.withdrawConsent}</p>

      {reports && (
        <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="cr-h">
          <h2 id="cr-h">{t.classReports}</h2>
          {reports.length === 0 ? <p className="cr-muted">{t.noReportsYet}</p> : (
            <ul className="cr-list">{reports.map((r, i) => {
              const text = ctx.locale === "lo" ? (r.report_lo || r.report_en) : (r.report_en || r.report_lo);
              return (
                <li key={`${r.lesson_date}-${i}`} style={{ display: "grid", gap: 4, justifyContent: "stretch" }}>
                  <span><b>{r.lesson_date}</b> · {r.class_name} · {[r.unit, r.lesson_title].filter(Boolean).join(" — ")}{r.level ? ` · ${r.level}` : ""}</span>
                  <span lang={ctx.locale === "lo" && r.report_lo ? "lo" : "en"}>{text}</span>
                </li>
              );
            })}</ul>
          )}
        </section>
      )}

      <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="rq-h">
        <h2 id="rq-h">{t.myRequests}</h2>
        <ParentRequests studentCode={current.code} rows={(reqRes.data ?? []) as ParentRequestRow[]} enabled={requestsEnabled} t={t} />
      </section>

      <section className="cr-card" style={{ marginTop: 14 }}>
        <h2>{t.parentComing}</h2>
        <p className="cr-muted">{t.parentComingList}</p>
      </section>
    </>
  );
}
