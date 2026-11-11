"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface HrPerson { id: string; name: string; role: string; status: string; payrollGrant: boolean; isSelf: boolean }
type Action = "grant_payroll" | "revoke_payroll" | "suspend" | "reinstate" | "offboard";

/** CEO: payroll access grants and the employment lifecycle. Each action asks for a reason (stored in the audit log). */
export function HrAdmin({ people, t }: { people: HrPerson[]; t: Dict }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ id: string; action: Action } | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const err = (c?: string) => c === "not_enabled" ? t.hrNotEnabled : (t as Record<string, string>)[`err_${c ?? "server_error"}`] ?? t.err_server_error;

  async function run() {
    if (!open) return;
    setBusy(true); setMsg(null);
    try {
      const body = open.action === "offboard" ? { action: open.action, userId: open.id, effectiveDate: date, reason } : { action: open.action, userId: open.id, reason };
      const res = await fetch("/api/cr360/hr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: err(j.reasonCode) }); return; }
      setOpen(null); setReason(""); setMsg({ tone: "ok", text: t.saved }); router.refresh();
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); } finally { setBusy(false); }
  }

  const btn = (p: HrPerson, a: Action, label: string) => (
    <button type="button" className="cr-btn ghost" style={{ minHeight: 36, padding: "0 10px", fontSize: 13 }} disabled={busy}
      onClick={() => { setOpen({ id: p.id, action: a }); setReason(""); }}>{label}</button>
  );
  return (
    <div>
      <ul className="cr-list">{people.map((p) => (
        <li key={p.id} style={{ display: "grid", gap: 6, justifyContent: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span><b>{p.name}</b> <span className="cr-muted">· {p.role} · {p.status}</span>
              {p.payrollGrant && <span className="cr-badge approved" style={{ marginLeft: 6 }}>{t.payrollAccess}</span>}</span>
            {!p.isSelf && (
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.payrollGrant ? btn(p, "revoke_payroll", t.revokePayroll) : btn(p, "grant_payroll", t.grantPayroll)}
                {p.status === "Suspended" ? btn(p, "reinstate", t.reinstate) : p.status !== "Terminated" && btn(p, "suspend", t.suspend)}
                {p.status === "Terminated" ? btn(p, "reinstate", t.reinstate) : btn(p, "offboard", t.offboard)}
              </span>
            )}
          </div>
          {open?.id === p.id && (
            <div className="cr-form">
              <div className="cr-banner info">{t[`hrHelp_${open.action}`]}</div>
              {open.action === "offboard" && <div className="cr-field"><label htmlFor={`d-${p.id}`}>{t.lastWorkingDay}</label>
                <input id={`d-${p.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
              <div className="cr-field"><label htmlFor={`r-${p.id}`}>{t.reason}</label>
                <input id={`r-${p.id}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cr-btn" disabled={busy || reason.trim().length < 3} onClick={run}>{busy ? t.submitting : t.confirm}</button>
                <button type="button" className="cr-btn ghost" onClick={() => setOpen(null)}>{t.cancel}</button>
              </div>
            </div>
          )}
        </li>
      ))}</ul>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}

/** Hide a confidential value until the person taps (shared screens, people looking over a shoulder). */
export function Reveal({ value, label }: { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  return shown
    ? <b>{value}</b>
    : <button type="button" className="cr-btn ghost" style={{ minHeight: 36, padding: "0 10px" }} onClick={() => setShown(true)}>👁 {label}</button>;
}
