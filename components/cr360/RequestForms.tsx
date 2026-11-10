"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

type Tab = "leave" | "ot" | "correction";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
}

export function RequestForms({ t }: { t: Dict }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("leave");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    const payload =
      tab === "leave" ? { type: s("type"), startDate: s("startDate"), endDate: s("endDate"), reason: s("reason") }
      : tab === "ot" ? { date: s("date"), minutes: Number(s("minutes")), reason: s("reason") }
      : { workDate: s("date"), type: s("type"), reason: s("reason") };
    setBusy(true); setMsg(null);
    const form = e.currentTarget;
    try {
      const res = await fetch(`/api/cr360/staff/${tab}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setMsg({ tone: "ok", text: t.submitted }); form.reset(); router.refresh(); }
      else setMsg({ tone: "bad", text: body.reasonCode === "validation" ? t.err_validation : t.err_server_error });
    } catch {
      setMsg({ tone: "bad", text: t.err_server_error });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="cr-tabs" role="tablist">
        {(["leave", "ot", "correction"] as Tab[]).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }}>{t[k]}</button>
        ))}
      </div>
      <form className="cr-form" onSubmit={submit} key={tab}>
        {tab === "leave" && (
          <>
            <div className="cr-field"><label htmlFor="lt">{t.type}</label>
              <select id="lt" name="type" required defaultValue="annual">
                {["annual", "sick", "personal", "unpaid", "other"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select></div>
            <div className="cr-row">
              <div className="cr-field"><label htmlFor="ls">{t.startDate}</label><input id="ls" name="startDate" type="date" required defaultValue={today()} /></div>
              <div className="cr-field"><label htmlFor="le">{t.endDate}</label><input id="le" name="endDate" type="date" required defaultValue={today()} /></div>
            </div>
          </>
        )}
        {tab === "ot" && (
          <div className="cr-row">
            <div className="cr-field"><label htmlFor="od">{t.date}</label><input id="od" name="date" type="date" required defaultValue={today()} /></div>
            <div className="cr-field"><label htmlFor="om">{t.minutes}</label><input id="om" name="minutes" type="number" min={15} max={720} step={15} required defaultValue={60} /></div>
          </div>
        )}
        {tab === "correction" && (
          <div className="cr-row">
            <div className="cr-field"><label htmlFor="cd">{t.date}</label><input id="cd" name="date" type="date" required defaultValue={today()} /></div>
            <div className="cr-field"><label htmlFor="ct">{t.type}</label>
              <select id="ct" name="type" required defaultValue="gps_unavailable">
                {["missed_in", "missed_out", "gps_unavailable", "shift_mismatch", "other"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select></div>
          </div>
        )}
        <div className="cr-field"><label htmlFor="rs">{t.reason}</label><textarea id="rs" name="reason" required minLength={3} maxLength={1000} rows={3} /></div>
        <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.submit}</button>
        <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
      </form>
    </div>
  );
}
