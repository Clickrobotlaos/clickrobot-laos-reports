"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface SubstituteRow { id: string; who: string; startsOn: string; endsOn: string; reason: string }

function todayVientiane() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
}

/**
 * Branch manager / CEO: assign a substitute teacher to this class for a date range, or end it early.
 * Only then can the substitute open this class's log, handover notes and student follow-up.
 * The database (0010) checks the branch, the dates and the staff status, and audits every change.
 */
export function SubstitutePanel({ classId, staff, current, t }: { classId: string; staff: { userId: string; name: string }[]; current: SubstituteRow[]; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const errText = (code?: string) => code === "not_enabled" ? t.lessonsNotEnabled : (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;

  async function post(body: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/lessons/substitute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return false; }
      router.refresh(); return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; }
    finally { setBusy(false); }
  }

  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await post({ action: "assign", classId, userId: String(f.get("user") ?? ""), startsOn: String(f.get("from") ?? ""), endsOn: String(f.get("to") ?? ""), reason: String(f.get("reason") ?? "") })) {
      setMsg({ tone: "ok", text: t.submitted });
    }
  }

  const today = todayVientiane();
  return (
    <section className="cr-card" aria-labelledby="sub-h" style={{ marginBottom: 14 }}>
      <h2 id="sub-h">{t.substitutesTitle}</h2>
      <p className="cr-muted">{t.substitutesNote}</p>
      {current.length === 0 ? <p className="cr-muted">{t.noSubstitutes}</p> : (
        <ul className="cr-list">{current.map((s) => (
          <li key={s.id}>
            <span><b>{s.who}</b> · {s.startsOn} → {s.endsOn}<br /><span className="cr-muted">{s.reason}</span></span>
            <button type="button" className="cr-btn ghost" style={{ minHeight: 40 }} disabled={busy}
              onClick={() => post({ action: "revoke", id: s.id })}>{t.endAssignment}</button>
          </li>
        ))}</ul>
      )}
      <form className="cr-form" onSubmit={assign} style={{ marginTop: 12 }} aria-label={t.assignSubstitute}>
        <div className="cr-field"><label htmlFor="sub-user">{t.employee}</label>
          <select id="sub-user" name="user" required>{staff.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select></div>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor="sub-from">{t.fromDate}</label><input id="sub-from" name="from" type="date" required defaultValue={today} /></div>
          <div className="cr-field"><label htmlFor="sub-to">{t.toDate}</label><input id="sub-to" name="to" type="date" required defaultValue={today} min={today} /></div>
        </div>
        <div className="cr-field"><label htmlFor="sub-reason">{t.reason}</label><input id="sub-reason" name="reason" required minLength={3} maxLength={300} /></div>
        <button className="cr-btn" type="submit" disabled={busy || staff.length === 0}>{busy ? t.submitting : t.assignSubstitute}</button>
      </form>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </section>
  );
}
