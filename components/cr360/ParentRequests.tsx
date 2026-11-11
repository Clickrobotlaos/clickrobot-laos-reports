"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict, DictKey } from "@/lib/cr360/i18n";

export interface ParentRequestRow { id: string; kind: string; start_date: string | null; end_date: string | null; message: string; status: string; review_note: string | null; created_at: string }
const KINDS = ["absence", "makeup", "extension", "schedule", "other"] as const;

export function ParentRequests({ studentCode, rows, enabled, t }: { studentCode: string; rows: ParentRequestRow[]; enabled: boolean; t: Dict }) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("absence");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
  const err = (c?: string) => c === "not_enabled" ? t.requestsNotEnabled : (t as Record<string, string>)[`err_${c ?? "server_error"}`] ?? t.err_server_error;

  async function post(path: string, body: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/cr360/guardian-requests/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: err(j.reasonCode) }); return false; }
      router.refresh(); return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; } finally { setBusy(false); }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const s = (k: string) => (String(f.get(k) ?? "").trim() || undefined);
    if (await post("create", { studentCode, kind, startDate: s("start"), endDate: s("end"), message: String(f.get("message") ?? "") })) {
      form.reset(); setMsg({ tone: "ok", text: t.submitted });
    }
  }

  if (!enabled) return <p className="cr-muted">{t.requestsNotEnabled}</p>;
  const needsDate = kind === "absence" || kind === "extension";
  return (
    <div>
      <p className="cr-muted">{t.requestNote}</p>
      {rows.length > 0 && (
        <ul className="cr-list">{rows.map((r) => (
          <li key={r.id} style={{ display: "grid", gap: 4, justifyContent: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span><b>{t[`req_${r.kind}` as DictKey] ?? r.kind}</b>{r.start_date ? ` · ${r.start_date}${r.end_date && r.end_date !== r.start_date ? ` → ${r.end_date}` : ""}` : ""}</span>
              <span className={`cr-badge ${r.status}`}>{(t as Record<string, string>)[r.status] ?? r.status}</span>
            </div>
            <span className="cr-muted">{r.message}</span>
            {r.review_note && <span>↳ {r.review_note}</span>}
            {r.status === "pending" && <div><button type="button" className="cr-btn ghost" disabled={busy} onClick={() => post("cancel", { id: r.id })}>{t.cancelRequest}</button></div>}
          </li>
        ))}</ul>
      )}
      <form className="cr-form" onSubmit={submit} style={{ marginTop: 12 }} aria-label={t.newRequest}>
        <div className="cr-field"><label htmlFor="rq-kind">{t.type}</label>
          <select id="rq-kind" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
            {KINDS.map((k) => <option key={k} value={k}>{t[`req_${k}` as DictKey]}</option>)}
          </select></div>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor="rq-s">{t.startDate}</label><input id="rq-s" name="start" type="date" required={needsDate} defaultValue={needsDate ? today : undefined} /></div>
          <div className="cr-field"><label htmlFor="rq-e">{t.endDate}</label><input id="rq-e" name="end" type="date" /></div>
        </div>
        <div className="cr-field"><label htmlFor="rq-m">{t.reason}</label><textarea id="rq-m" name="message" required minLength={3} maxLength={1000} rows={3} /></div>
        <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.submit}</button>
      </form>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}
