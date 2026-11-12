import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { safeDirectoryRow } from "@/lib/cr360/redact";
import { Unauthorized, StatusBadge } from "@/components/cr360/Blocks";
import { DecisionButtons } from "@/components/cr360/DecisionButtons";
import { ShiftPlanner, type PlannedShift } from "@/components/cr360/ShiftPlanner";
import { businessDate, formatDateTime } from "@/lib/cr360/i18n";
import { studentBranchScope } from "@/lib/cr360/access";
import { loadTeachingKpis } from "@/lib/cr360/teaching-kpis-load";
import { AnnouncementsAdmin, type AnnRow } from "@/components/cr360/Announcements";
import { hasRole } from "@/lib/cr360/access";

export const dynamic = "force-dynamic";

/**
 * Manager / HR / CEO branch view. Approve/reject calls the audited DB function from migration 0004. RLS (cr360_authz.can_access_branch) restricts managers to their
 * own branch; CEO/HR see all. Directory uses an explicit safe-column allow-list (no money/bank/ID).
 */
export default async function ManagerPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "manager")) return <Unauthorized t={t} />;
  const sb = await supabaseServer();

  const now = new Date();
  const nowIso = now.toISOString();
  const until = new Date(now.getTime() + 14 * 864e5).toISOString();
  const [emps, leave, ot, corr, shiftRes] = await Promise.all([
    sb.from("cr360_hr_employees").select("id,display_name,position,branch_id,employment_status,employee_code,start_date").order("display_name"),
    sb.from("cr360_hr_leave_requests").select("id,employee_id,leave_type,start_date,end_date,status,created_at").eq("status", "pending").order("created_at"),
    sb.from("cr360_hr_ot_requests").select("id,employee_id,work_date,minutes,status,created_at").eq("status", "pending").order("created_at"),
    sb.from("cr360_hr_correction_requests").select("id,employee_id,work_date,correction_type,status,created_at").eq("status", "pending").order("created_at"),
    sb.from("cr360_hr_shifts").select("id,employee_id,starts_at,ends_at,status").neq("status", "cancelled").gte("ends_at", nowIso).lte("starts_at", until).order("starts_at").limit(500),
  ]);
  // Parent requests (0009): DB function returns only students this user may manage; missing → none.
  const gr = await sb.rpc("cr360_guardian_requests_for_staff");
  const guardianReqs = (gr.error ? [] : (gr.data ?? [])) as { id: string; student_code: string; student_name: string | null; kind: string; start_date: string | null; end_date: string | null; message: string; status: string }[];
  const staff = (emps.data ?? []).map(safeDirectoryRow) as { id: string; display_name: string; position: string; employment_status: string; employee_code: string | null }[];
  const name = new Map(staff.map((s) => [s.id, s.display_name]));
  const planned: PlannedShift[] = ((shiftRes.data ?? []) as { id: string; employee_id: string; starts_at: string; ends_at: string }[]).map((r) => ({
    id: r.id, who: name.get(r.employee_id) ?? "—",
    label: `${formatDateTime(r.starts_at, ctx.locale)} → ${formatDateTime(r.ends_at, ctx.locale)}`,
    startsInFuture: Date.parse(r.starts_at) > now.getTime(),
  }));
  // Teaching indicators, month to date (branch scope from DB membership; CEO = all branches).
  const today = businessDate(now);
  const monthStart = today.slice(0, 8) + "01";
  const kpi = await loadTeachingKpis(sb, studentBranchScope(ctx.viewer), monthStart, today);
  // Announcements (0017): RLS shows drafts only to their managers / CEO.
  const isCeo = hasRole(ctx.viewer, ["ceo"]);
  const scopeB = studentBranchScope(ctx.viewer);
  const [annRes, brRes] = await Promise.all([
    sb.from("cr360_announcements").select("id,title_en,title_lo,audience,status,show_from,show_until,branch_id").order("created_at", { ascending: false }).limit(30),
    sb.from("branches").select("id,name").eq("active", true).order("name"),
  ]);
  const branchList = ((brRes.data ?? []) as { id: string; name: string }[]).filter((b) => isCeo || (scopeB ?? []).includes(b.id));
  const branchName = new Map(((brRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const annRows: AnnRow[] = ((annRes.data ?? []) as (Omit<AnnRow, "branch_name"> & { branch_id: string | null })[])
    .map((a) => ({ ...a, branch_name: a.branch_id ? branchName.get(a.branch_id) ?? "—" : null }));
  const pctCell = (v: number | null) => (v === null ? "—" : `${v}%`);

  const activeStaff = staff.filter((p) => p.employment_status === "active").map((p) => ({ id: p.id, name: p.display_name }));
  const queue = [
    ...(leave.data ?? []).map((r) => ({ id: r.id, who: r.employee_id, k: "leave" as const, kind: t.leave, detail: `${r.leave_type} · ${r.start_date} → ${r.end_date}`, status: r.status })),
    ...(ot.data ?? []).map((r) => ({ id: r.id, who: r.employee_id, k: "ot" as const, kind: t.ot, detail: `${r.work_date} · ${r.minutes} ${t.minutes}`, status: r.status })),
    ...(corr.data ?? []).map((r) => ({ id: r.id, who: r.employee_id, k: "correction" as const, kind: t.correction, detail: `${r.work_date} · ${r.correction_type}`, status: r.status })),
    ...guardianReqs.filter((r) => r.status === "pending").map((r) => ({
      id: r.id, who: `guardian:${r.student_code}`, k: "guardian" as const, kind: t.parentRequestKind,
      detail: `${r.student_name ?? r.student_code} · ${(t as Record<string, string>)[`req_${r.kind}`] ?? r.kind}${r.start_date ? ` · ${r.start_date}` : ""} — ${r.message}`, status: r.status,
    })),
  ];

  // Parent messages (0018): unread conversations visible to this person; missing table → no link.
  const msgRes = await sb.from("cr360_message_threads").select("last_message_at,staff_read_at").eq("status", "open").limit(200);
  const msgUnread = msgRes.error ? null : ((msgRes.data ?? []) as { last_message_at: string; staff_read_at: string | null }[])
    .filter((r) => !r.staff_read_at || r.staff_read_at < r.last_message_at).length;

  return (
    <>
      <h1 className="cr-h1">{t.ws_manager}</h1>
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 10px" }}><a className="cr-btn ghost" href="/360/finance/expenses" style={{ minHeight: 40 }}>🧾 {t.expenseRequests}</a><a className="cr-btn ghost" href="/360/finance/cashbook" style={{ minHeight: 40 }}>📒 {t.cashbook}</a><a className="cr-btn ghost" href="/360/inventory" style={{ minHeight: 40 }}>📦 {t.inventory}</a></p>
      {msgUnread !== null && (
        <p style={{ margin: "4px 0 10px" }}><a className="cr-btn ghost" href="/360/messages" style={{ minHeight: 40 }}>💬 {t.parentMessages}{msgUnread > 0 ? ` · ${msgUnread} ${t.unreadCount}` : ""}</a></p>
      )}
      <div className="cr-grid c2">
        <section className="cr-card" aria-labelledby="q-h">
          <h2 id="q-h">{t.pendingQueue} ({queue.length})</h2>
          <div className="cr-banner info">{t.approvalsPending}</div>
          {queue.length === 0 ? <p className="cr-muted">{t.noRequests}</p> : (
            <ul className="cr-list">{queue.map((q) => (
              <li key={q.id}>
                <span><b>{q.who.startsWith("guardian:") ? q.kind : name.get(q.who) ?? "—"}</b>{q.who.startsWith("guardian:") ? "" : ` · ${q.kind}`} · {q.detail}</span><StatusBadge status={q.status} t={t} />
                {q.who === ctx.employee?.id
                  ? <p className="cr-muted" style={{ width: "100%", margin: 0 }}>{t.ownRequest}</p>
                  : <DecisionButtons kind={q.k} id={q.id} t={t} />}
              </li>
            ))}</ul>
          )}
        </section>
        <section className="cr-card" aria-labelledby="sp-h">
          <h2 id="sp-h">{t.shiftPlanner}</h2>
          <ShiftPlanner staff={activeStaff} shifts={planned} t={t} />
        </section>
        <section className="cr-card" aria-labelledby="an-h">
          <h2 id="an-h">📣 {t.announcements}</h2>
          {annRes.error ? <div className="cr-banner info">{t.announcementsNotEnabled}</div>
            : <AnnouncementsAdmin rows={annRows} branches={branchList} allowAll={isCeo} t={t} />}
        </section>

        <section className="cr-card" aria-labelledby="tk-h">
          <h2 id="tk-h">{t.teachingKpis} · {monthStart} → {today}</h2>
          <p className="cr-muted">{t.teachingKpisNote}</p>
          {!kpi.logsEnabled && <div className="cr-banner info">{t.lessonsNotEnabled}</div>}
          {kpi.error ? <div className="cr-banner bad">{t.err_server_error}</div> : kpi.rows.length === 0 ? <p className="cr-muted">{t.noTeachingData}</p> : (
            <div className="cr-tablewrap">
              <table className="cr-table">
                <thead><tr><th scope="col">{t.teacher}</th><th scope="col">{t.kpiScheduled}</th><th scope="col">{t.kpiRollCall}</th><th scope="col">{t.kpiLogged}</th><th scope="col">{t.kpiReportsApproved}</th></tr></thead>
                <tbody>{kpi.rows.map((k) => (
                  <tr key={k.teacherId}>
                    <td>{k.name}</td><td>{k.scheduled}</td>
                    <td>{k.rollCall} <span className="cr-muted">({pctCell(k.rollCallPct)})</span></td>
                    <td>{k.logged} <span className="cr-muted">({pctCell(k.loggedPct)})</span></td>
                    <td>{k.approved}/{k.notes} <span className="cr-muted">({pctCell(k.approvedPct)})</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cr-card" aria-labelledby="s-h">
          <h2 id="s-h">{t.branchStaff} ({staff.length})</h2>
          <div className="cr-tablewrap">
            <table className="cr-table">
              <thead><tr><th scope="col">Name</th><th scope="col">Position</th><th scope="col">{t.status}</th></tr></thead>
              <tbody>{staff.map((s) => (
                <tr key={s.id}><td>{s.display_name}{s.employee_code ? <span className="cr-muted"> · {s.employee_code}</span> : null}</td><td>{s.position}</td><td>{s.employment_status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
