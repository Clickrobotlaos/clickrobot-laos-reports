"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface PlannedShift { id: string; who: string; label: string; startsInFuture: boolean }

function todayVientiane() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
}

/** Manager shift planner. The DB function (0008) enforces branch scope, overlap, no back-dating and audit. */
export function ShiftPlanner({ staff, shifts, t }: { staff: { id: string; name: string }[]; shifts: PlannedShift[]; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const errText = (code?: string) => code === "not_enabled" ? t.shiftsNotEnabled : (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;

  async function post(path: string, body: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/cr360/shifts/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return false; }
      router.refresh();
      return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; }
    finally { setBusy(false); }
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await post("create", {
      employeeId: String(f.get("employee") ?? ""), date: String(f.get("date") ?? ""),
      start: String(f.get("start") ?? ""), end: String(f.get("end") ?? ""), overnight: f.get("overnight") === "on",
    });
    if (ok) setMsg({ tone: "ok", text: t.submitted });
  }

  return (
    <div>
      <p className="cr-muted">{t.shiftTimesNote}</p>
      {shifts.length === 0 ? <p className="cr-muted">{t.noUpcomingShifts}</p> : (
        <ul className="cr-list">{shifts.map((s) => (
          <li key={s.id} style={{ display: "grid", gap: 6, justifyContent: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span><b>{s.who}</b> · {s.label}</span>
              {s.startsInFuture && cancelling !== s.id && (
                <button type="button" className="cr-btn ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }}
                  onClick={() => { setCancelling(s.id); setReason(""); }}>{t.cancelShift}</button>
              )}
            </div>
            {cancelling === s.id && (
              <div className="cr-form">
                <div className="cr-field"><label htmlFor={`cr-${s.id}`}>{t.cancelReason}</label>
                  <input id={`cr-${s.id}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="cr-btn" disabled={busy || reason.trim().length < 3}
                    onClick={async () => { if (await post("cancel", { shiftId: s.id, reason })) setCancelling(null); }}>{t.cancelShift}</button>
                  <button type="button" className="cr-btn ghost" onClick={() => setCancelling(null)}>{t.cancel}</button>
                </div>
              </div>
            )}
          </li>
        ))}</ul>
      )}

      <form className="cr-form" onSubmit={add} style={{ marginTop: 14 }} aria-label={t.addShift}>
        <div className="cr-field"><label htmlFor="sp-emp">{t.employee}</label>
          <select id="sp-emp" name="employee" required>{staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="sp-date">{t.date}</label><input id="sp-date" name="date" type="date" required defaultValue={todayVientiane()} min={todayVientiane()} /></div>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor="sp-start">{t.startTime}</label><input id="sp-start" name="start" type="time" required defaultValue="08:00" /></div>
          <div className="cr-field"><label htmlFor="sp-end">{t.endTime}</label><input id="sp-end" name="end" type="time" required defaultValue="17:00" /></div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="overnight" style={{ width: 20, height: 20, minHeight: 0 }} /> <span>{t.overnight}</span>
        </label>
        <button className="cr-btn" type="submit" disabled={busy || staff.length === 0}>{busy ? t.submitting : t.addShift}</button>
      </form>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}
