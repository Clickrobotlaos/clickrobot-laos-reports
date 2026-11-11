"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface AnnRow { id: string; title_en: string; title_lo: string | null; audience: string; status: string; show_from: string; show_until: string; branch_name: string | null }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
const plus = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Manager / CEO: write, publish and withdraw in-app announcements. Nothing is sent outside the app. */
export function AnnouncementsAdmin({ rows, branches, allowAll, t }: { rows: AnnRow[]; branches: { id: string; name: string }[]; allowAll: boolean; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const err = (c?: string) => c === "not_enabled" ? t.announcementsNotEnabled : (t as Record<string, string>)[`err_${c ?? "server_error"}`] ?? t.err_server_error;
  async function call(body: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: err(j.reasonCode) }); return false; }
      router.refresh(); return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; } finally { setBusy(false); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
    const ok = await call({ action: "save", branchId: s("branch") || null, audience: s("audience"), titleEn: s("titleEn"), titleLo: s("titleLo") || undefined,
      bodyEn: s("bodyEn"), bodyLo: s("bodyLo") || undefined, showFrom: s("from"), showUntil: s("until"), publish: f.get("publish") === "on" });
    if (ok) { form.reset(); setMsg({ tone: "ok", text: t.saved }); }
  }
  const d = today();
  return (
    <div>
      <p className="cr-muted">{t.announcementsNote}</p>
      {rows.length > 0 && <ul className="cr-list">{rows.map((a) => (
        <li key={a.id}>
          <span><b>{a.title_en}</b>{a.title_lo ? ` · ${a.title_lo}` : ""}<br />
            <span className="cr-muted">{a.branch_name ?? t.allBranches} · {t[`aud_${a.audience as "parents"}`]} · {a.show_from} → {a.show_until}</span></span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className={`cr-badge ${a.status === "published" ? "approved" : a.status === "draft" ? "pending" : ""}`}>{t[`annSt_${a.status as "draft"}`]}</span>
            {a.status === "draft" && <button type="button" className="cr-btn teal" style={{ minHeight: 36 }} disabled={busy} onClick={() => call({ action: "publish", id: a.id })}>{t.publish}</button>}
            {a.status === "published" && <button type="button" className="cr-btn ghost" style={{ minHeight: 36 }} disabled={busy} onClick={() => call({ action: "withdraw", id: a.id })}>{t.withdraw}</button>}
          </span>
        </li>
      ))}</ul>}
      <form className="cr-form" onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor="an-b">{t.branch}</label>
            <select id="an-b" name="branch">{allowAll && <option value="">{t.allBranches}</option>}{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="cr-field"><label htmlFor="an-a">{t.audience}</label>
            <select id="an-a" name="audience"><option value="parents">{t.aud_parents}</option><option value="staff">{t.aud_staff}</option><option value="all">{t.aud_all}</option></select></div>
        </div>
        <div className="cr-field"><label htmlFor="an-te">{t.titleEnLbl}</label><input id="an-te" name="titleEn" required minLength={2} maxLength={140} /></div>
        <div className="cr-field"><label htmlFor="an-tl">{t.titleLoLbl}</label><input id="an-tl" name="titleLo" maxLength={140} /></div>
        <div className="cr-field"><label htmlFor="an-be">{t.messageEn}</label><textarea id="an-be" name="bodyEn" rows={3} required minLength={2} maxLength={2000} /></div>
        <div className="cr-field"><label htmlFor="an-bl">{t.messageLo}</label><textarea id="an-bl" name="bodyLo" rows={3} maxLength={2000} /></div>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor="an-f">{t.fromDate}</label><input id="an-f" name="from" type="date" required defaultValue={d} /></div>
          <div className="cr-field"><label htmlFor="an-u">{t.toDate}</label><input id="an-u" name="until" type="date" required defaultValue={plus(d, 7)} min={d} /></div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="publish" style={{ width: 20, height: 20, minHeight: 0 }} /> {t.publishNow}</label>
        <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.saveAnnouncement}</button>
      </form>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}
