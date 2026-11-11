import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { groupChildren } from "@/lib/cr360/parent";
import { Unauthorized } from "@/components/cr360/Blocks";
import { ParentRequests, type ParentRequestRow } from "@/components/cr360/ParentRequests";
import { ConsentChoices, type ConsentPurpose } from "@/components/cr360/ConsentChoices";
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

  // Schedule + invoices (0014): missing functions → "coming soon"; data only for a verified child.
  const [schRes, invRes] = await Promise.all([
    sb.rpc("cr360_guardian_schedule", { p_student_code: current.code }),
    sb.rpc("cr360_guardian_invoices", { p_student_code: current.code }),
  ]);
  const schedule = (schRes.error ? null : schRes.data ?? []) as { class_date: string; start_time: string; end_time: string; class_name: string; room: string | null; branch_name: string | null; kind: string }[] | null;
  const invoices = (invRes.error ? null : invRes.data ?? []) as { invoice_no: string; invoice_date: string; due_date: string | null; package: string | null; amount: number; currency: string; status: string; paid_at: string | null }[] | null;
  const money = (n: number, c: string) => { try { return new Intl.NumberFormat(ctx.locale === "lo" ? "lo-LA" : "en-US", { style: "currency", currency: c, maximumFractionDigits: c === "LAK" ? 0 : 2 }).format(n); } catch { return `${n} ${c}`; } };
  const dayLabel = (d: string) => new Intl.DateTimeFormat(ctx.locale === "lo" ? "lo-LA" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const invStatus: Record<string, string> = { Paid: t.invPaid, Sent: t.invSent, Cancelled: t.invCancelled };

  // Achievements (0015): issued only, verified child only; missing function → section hidden.
  const achRes = await sb.rpc("cr360_guardian_achievements", { p_student_code: current.code });
  const achievements = (achRes.error ? null : achRes.data ?? []) as { id: string; kind: string; title_en: string; title_lo: string | null; awarded_on: string; certificate_no: string | null }[] | null;

  // Consent choices (0013): missing function → "coming soon"; only this guardian's own rows come back.
  const conRes = await sb.rpc("cr360_guardian_my_consents");
  const consentsEnabled = !conRes.error;
  const mine = ((conRes.data ?? []) as { student_code: string; purpose: string; granted: boolean; consent_version: string | null; recorded_at: string | null }[])
    .filter((r) => r.student_code === current.code);
  const reqRow = mine.find((r) => r.purpose === "data_processing");
  const consentState: Partial<Record<ConsentPurpose, boolean>> = {};
  for (const r of mine) if (r.purpose !== "data_processing") consentState[r.purpose as ConsentPurpose] = r.granted;

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

      {achievements && achievements.length > 0 && (
        <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="pach-h">
          <h2 id="pach-h">🏆 {t.achievements}</h2>
          <ul className="cr-list">{achievements.map((a) => (
            <li key={a.id}>
              <span><b>{ctx.locale === "lo" && a.title_lo ? a.title_lo : a.title_en}</b><br /><span className="cr-muted">{a.awarded_on}{a.certificate_no ? ` · ${a.certificate_no}` : ""}</span></span>
              <Link className="cr-btn ghost" style={{ minHeight: 40 }} href={`/360/parent/certificate/${a.id}?child=${encodeURIComponent(current.code)}`}>{t.viewCertificate}</Link>
            </li>
          ))}</ul>
        </section>
      )}

      <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="up-h">
        <h2 id="up-h">{t.upcomingClasses}</h2>
        {schedule === null ? <p className="cr-muted">{t.portalSoon}</p> : schedule.length === 0 ? <p className="cr-muted">{t.noUpcomingClasses}</p> : (
          <ul className="cr-list">{schedule.map((c, i) => (
            <li key={`${c.class_date}-${c.start_time}-${i}`}>
              <span><b>{dayLabel(c.class_date)}</b> · {String(c.start_time).slice(0, 5)}–{String(c.end_time).slice(0, 5)}
                {c.kind === "makeup" && <span className="cr-badge" style={{ marginLeft: 6 }}>{t.makeupClass}</span>}
                <br /><span className="cr-muted">{[c.class_name, c.room, c.branch_name].filter(Boolean).join(" · ")}</span></span>
            </li>
          ))}</ul>
        )}
      </section>

      <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="inv-h">
        <h2 id="inv-h">{t.invoicesPayments}</h2>
        {invoices === null ? <p className="cr-muted">{t.portalSoon}</p> : (
          <>
            {invoices.length === 0 ? <p className="cr-muted">{t.noInvoices}</p> : (
              <ul className="cr-list">{invoices.map((v) => (
                <li key={v.invoice_no}>
                  <span><b>{v.invoice_no}</b> · {v.invoice_date}<br /><span className="cr-muted">{v.package ?? ""}</span></span>
                  <span style={{ textAlign: "right" }}><b>{money(Number(v.amount), v.currency)}</b><br />
                    <span className={`cr-badge ${v.status === "Paid" ? "approved" : v.status === "Sent" ? "pending" : ""}`}>{invStatus[v.status] ?? v.status}</span></span>
                </li>
              ))}</ul>
            )}
            <p className="cr-muted" style={{ marginTop: 8 }}>{t.invoicesNote}</p>
          </>
        )}
      </section>

      <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="rq-h">
        <h2 id="rq-h">{t.myRequests}</h2>
        <ParentRequests studentCode={current.code} rows={(reqRes.data ?? []) as ParentRequestRow[]} enabled={requestsEnabled} t={t} />
      </section>

      <section className="cr-card" style={{ marginTop: 14 }} aria-labelledby="pc-h">
        <h2 id="pc-h">{t.privacyChoices}</h2>
        <ConsentChoices studentCode={current.code} state={consentState} enabled={consentsEnabled} t={t}
          required={reqRow ? { version: reqRow.consent_version, at: reqRow.recorded_at } : null} />
      </section>

      <section className="cr-card" style={{ marginTop: 14 }}>
        <h2>{t.parentComing}</h2>
        <p className="cr-muted">{t.parentComingList}</p>
      </section>
    </>
  );
}
