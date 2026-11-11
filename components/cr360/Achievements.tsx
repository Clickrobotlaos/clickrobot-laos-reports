"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

const KINDS = ["badge", "level_complete", "competition", "certificate"] as const;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());

async function post(body: unknown): Promise<{ ok: boolean; code?: string }> {
  try {
    const res = await fetch("/api/cr360/achievements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, code: j.reasonCode };
  } catch { return { ok: false, code: "server_error" }; }
}
const errText = (t: Dict, code?: string) => code === "not_enabled" ? t.achievementsNotEnabled : (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;

/** Teacher: propose an achievement for one student (a manager issues it). */
export function AwardForm({ packageId, t }: { packageId: string; t: Dict }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    setBusy(true); setMsg(null);
    const r = await post({ action: "propose", packageId, kind: String(f.get("kind")), titleEn: String(f.get("titleEn") ?? ""),
      titleLo: String(f.get("titleLo") ?? "").trim() || undefined, awardedOn: today() });
    setBusy(false);
    if (r.ok) { form.reset(); setMsg({ tone: "ok", text: t.awardProposed }); } else setMsg({ tone: "warn", text: errText(t, r.code) });
  }
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="cr-muted" style={{ cursor: "pointer", minHeight: 32 }}>🏅 {t.awardAchievement}</summary>
      <form className="cr-form" onSubmit={submit} style={{ marginTop: 6 }}>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor={`ak-${packageId}`}>{t.achievementKind}</label>
            <select id={`ak-${packageId}`} name="kind">{KINDS.map((k) => <option key={k} value={k}>{t[`ach_${k}`]}</option>)}</select></div>
          <div className="cr-field"><label htmlFor={`at-${packageId}`}>{t.titleEnLbl}</label><input id={`at-${packageId}`} name="titleEn" required minLength={2} maxLength={160} /></div>
        </div>
        <div className="cr-field"><label htmlFor={`al-${packageId}`}>{t.titleLoLbl}</label><input id={`al-${packageId}`} name="titleLo" maxLength={160} /></div>
        <button className="cr-btn ghost" type="submit" disabled={busy}>{busy ? t.submitting : t.proposeAward}</button>
        <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
      </form>
    </details>
  );
}

export interface AchievementRow { id: string; kind: string; title_en: string; title_lo: string | null; awarded_on: string; status: string; certificate_no: string | null }

/** Manager / CEO: issue, decline or revoke. */
export function AchievementReview({ rows, t }: { rows: AchievementRow[]; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function act(id: string, action: "issue" | "decline" | "revoke") {
    let reason: string | undefined;
    if (action === "revoke") { reason = window.prompt(t.revokeReasonPrompt) ?? ""; if (reason.trim().length < 3) return; }
    setBusy(id); setMsg(null);
    const r = await post({ action, id, reason });
    setBusy(null);
    if (r.ok) router.refresh(); else setMsg(errText(t, r.code));
  }
  if (rows.length === 0) return <p className="cr-muted">{t.noAchievements}</p>;
  return (
    <>
      <ul className="cr-list">{rows.map((a) => (
        <li key={a.id}>
          <span><b>{a.title_en}</b>{a.title_lo ? ` · ${a.title_lo}` : ""}<br />
            <span className="cr-muted">{t[`ach_${a.kind as (typeof KINDS)[number]}`] ?? a.kind} · {a.awarded_on}{a.certificate_no ? ` · ${a.certificate_no}` : ""}</span></span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className={`cr-badge ${a.status === "issued" ? "approved" : a.status === "proposed" ? "pending" : "rejected"}`}>{t[`achSt_${a.status as "proposed"}`] ?? a.status}</span>
            {a.status === "proposed" && <>
              <button type="button" className="cr-btn teal" style={{ minHeight: 40 }} disabled={busy !== null} onClick={() => act(a.id, "issue")}>{t.issueCert}</button>
              <button type="button" className="cr-btn ghost" style={{ minHeight: 40 }} disabled={busy !== null} onClick={() => act(a.id, "decline")}>{t.decline}</button>
            </>}
            {a.status === "issued" && <button type="button" className="cr-btn ghost" style={{ minHeight: 40 }} disabled={busy !== null} onClick={() => act(a.id, "revoke")}>{t.revoke}</button>}
          </span>
        </li>
      ))}</ul>
      <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
    </>
  );
}
