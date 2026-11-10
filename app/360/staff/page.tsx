import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict, formatDateTime } from "@/lib/cr360/i18n";
import { attendancePercent } from "@/lib/cr360/staff-metrics";
import { Unauthorized, StatusBadge } from "@/components/cr360/Blocks";
import { TimeClock } from "@/components/cr360/TimeClock";
import { RequestForms } from "@/components/cr360/RequestForms";

export const dynamic = "force-dynamic";

export default async function StaffOsPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "staff") || !ctx.employee) return <Unauthorized t={t} />;
  const emp = ctx.employee;
  const sb = await supabaseServer();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 864e5).toISOString();
  const until = new Date(now.getTime() + 7 * 864e5).toISOString();

  // Every query is ALSO filtered by RLS to the caller's own employee row.
  const [shifts, punches, leave, ot, corr, site] = await Promise.all([
    sb.from("cr360_hr_shifts").select("id,starts_at,ends_at,status").eq("employee_id", emp.id).gte("starts_at", since).lte("starts_at", until).order("starts_at"),
    sb.from("cr360_hr_attendance_events").select("id,kind,occurred_at,distance_m,reported_accuracy_m,source").eq("employee_id", emp.id).gte("occurred_at", since).order("occurred_at", { ascending: false }),
    sb.from("cr360_hr_leave_requests").select("id,leave_type,start_date,end_date,status,created_at").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(10),
    sb.from("cr360_hr_ot_requests").select("id,work_date,minutes,status,created_at").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(10),
    sb.from("cr360_hr_correction_requests").select("id,work_date,correction_type,status,created_at").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(10),
    sb.from("cr360_hr_sites").select("enabled,approved_at").eq("branch_id", emp.branch_id).maybeSingle(),
  ]);

  const shiftRows = shifts.data ?? [];
  const punchRows = (punches.data ?? []) as { id: string; kind: "in" | "out"; occurred_at: string; distance_m: number; reported_accuracy_m: number; source: string }[];
  const pct = attendancePercent(shiftRows, punchRows, now);
  const upcoming = shiftRows.filter((s) => Date.parse(s.ends_at) > now.getTime()).slice(0, 7);
  const lastKind = punchRows[0]?.kind ?? null;
  // A manager reading cr360_hr_sites sees their branch; plain staff may get null (RLS) — treated as "not enabled".
  const siteEnabled = !!(site.data?.enabled && site.data?.approved_at);

  const requests = [
    ...(leave.data ?? []).map((r) => ({ id: r.id, kind: t.leave, detail: `${r.leave_type} · ${r.start_date} → ${r.end_date}`, status: r.status, at: r.created_at })),
    ...(ot.data ?? []).map((r) => ({ id: r.id, kind: t.ot, detail: `${r.work_date} · ${r.minutes} ${t.minutes}`, status: r.status, at: r.created_at })),
    ...(corr.data ?? []).map((r) => ({ id: r.id, kind: t.correction, detail: `${r.work_date} · ${r.correction_type}`, status: r.status, at: r.created_at })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <h1 className="cr-h1">{t.ws_staff}</h1>
      <p className="cr-sub">{emp.display_name} · {emp.position}</p>
      <div className="cr-banner info">{t.moneyHidden}</div>

      <div className="cr-grid c2">
        <section className="cr-card" aria-labelledby="clock-h">
          <h2 id="clock-h">{t.timeClock}</h2>
          <TimeClock lastKind={lastKind} siteEnabledHint={siteEnabled} t={t} />
        </section>

        <section className="cr-card cr-kpi" aria-labelledby="pct-h">
          <div className="lbl" id="pct-h">{t.attendancePct}</div>
          <div className="val">{pct === null ? "—" : `${pct}%`}</div>
          <div className="cr-gauge" aria-hidden="true"><span style={{ width: `${pct ?? 0}%` }} /></div>
          <p className="cr-muted">{t.attendanceHint}</p>
        </section>

        <section className="cr-card" aria-labelledby="shifts-h">
          <h2 id="shifts-h">{t.myShifts}</h2>
          {upcoming.length === 0 ? <p className="cr-muted">{t.noShifts}</p> : (
            <ul className="cr-list">
              {upcoming.map((s) => (
                <li key={s.id}><span>{formatDateTime(s.starts_at, ctx.locale)} → {formatDateTime(s.ends_at, ctx.locale)}</span><span className="cr-badge">{s.status}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="cr-card" aria-labelledby="punch-h">
          <h2 id="punch-h">{t.recentPunches}</h2>
          {punchRows.length === 0 ? <p className="cr-muted">{t.noPunches}</p> : (
            <ul className="cr-list">
              {punchRows.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <span><b>{p.kind === "in" ? t.checkIn : t.checkOut}</b> · {formatDateTime(p.occurred_at, ctx.locale)}</span>
                  <span className="cr-muted">{Number(p.distance_m).toFixed(1)} m · ±{Number(p.reported_accuracy_m).toFixed(1)} m</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cr-card" aria-labelledby="req-form-h">
          <h2 id="req-form-h">{t.requests}</h2>
          <RequestForms t={t} />
        </section>

        <section className="cr-card" aria-labelledby="req-list-h">
          <h2 id="req-list-h">{t.status}</h2>
          {requests.length === 0 ? <p className="cr-muted">{t.noRequests}</p> : (
            <ul className="cr-list">
              {requests.map((r) => (
                <li key={r.id}><span><b>{r.kind}</b> · {r.detail}</span><StatusBadge status={r.status} t={t} /></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
