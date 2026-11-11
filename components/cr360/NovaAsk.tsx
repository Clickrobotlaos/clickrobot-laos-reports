"use client";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

/** Parent asks NOVA about their child's learning. Nothing is stored; answers are AI-generated and may be imperfect. */
export function NovaAsk({ studentCode, ready, t }: { studentCode: string; ready: boolean; t: Dict }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (q.length < 2) return;
    setBusy(true); setMsg(null); setAnswer(null);
    try {
      const res = await fetch("/api/cr360/nova", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentCode, question: q }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setAnswer(j.answer); else setMsg((t as Record<string, string>)[`err_${j.reasonCode ?? "server_error"}`] ?? t.err_server_error);
    } catch { setMsg(t.err_server_error); } finally { setBusy(false); }
  }
  if (!ready) return <p className="cr-muted">{t.novaOff}</p>;
  return (
    <div>
      <p className="cr-muted">{t.novaNote}</p>
      <form className="cr-form" onSubmit={ask}>
        <div className="cr-field"><label htmlFor="nova-q">{t.novaAskLbl}</label>
          <textarea id="nova-q" name="q" rows={2} maxLength={500} required placeholder={t.novaPlaceholder} /></div>
        <button className="cr-btn teal" type="submit" disabled={busy}>{busy ? t.novaThinking : t.novaAsk}</button>
      </form>
      <div aria-live="polite">
        {answer && <div className="cr-banner info" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>✨ {answer}</div>}
        {msg && <div className="cr-banner warn" style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  );
}
