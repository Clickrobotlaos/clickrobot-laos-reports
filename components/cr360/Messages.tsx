"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface ThreadRow { id: string; subject: string; status: string; last_message_at: string; unread: boolean; label?: string }
export interface MessageRow { id: number; sender_side: "guardian" | "staff"; body: string; created_at: string }

async function call(body: unknown) {
  const res = await fetch("/api/cr360/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, code: j.reasonCode as string | undefined, data: j.result };
}

/** List of conversations; each links to `${hrefBase}thread=<id>`. */
export function ThreadList({ threads, hrefBase, current, t }: { threads: ThreadRow[]; hrefBase: string; current: string | null; t: Dict }) {
  if (threads.length === 0) return <p className="cr-muted">{t.noMessages}</p>;
  return (
    <ul className="cr-list">{threads.map((th) => (
      <li key={th.id} style={th.id === current ? { background: "var(--c-surface2)", borderRadius: 10 } : undefined}>
        <Link href={`${hrefBase}thread=${th.id}`} style={{ flex: 1, textDecoration: "none", color: "inherit" }}>
          <b>{th.unread ? "● " : ""}{th.subject}</b><br />
          <span className="cr-muted" style={{ fontSize: 13 }}>{th.label ? `${th.label} · ` : ""}{th.last_message_at.slice(0, 16).replace("T", " ")}{th.status === "closed" ? ` · ${t.closed}` : ""}</span>
        </Link>
      </li>
    ))}</ul>
  );
}

/** One conversation: messages (oldest first) + reply box. `side` is the viewer's side. */
export function Conversation({ threadId, messages, side, canClose, status, t }: {
  threadId: string; messages: MessageRow[]; side: "guardian" | "staff"; canClose: boolean; status: string; t: Dict;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const err = (c?: string) => (t as Record<string, string>)[`err_${c ?? "server_error"}`] ?? t.err_server_error;
  useEffect(() => { void call({ action: "read", threadId }); }, [threadId]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setBusy(true); setMsg(null);
    const r = await call({ action: "send", threadId, body });
    setBusy(false);
    if (r.ok) { form.reset(); router.refresh(); } else setMsg(err(r.code));
  }
  return (
    <div>
      <ol className="cr-chat">{messages.map((m) => (
        <li key={m.id} className={m.sender_side === side ? "mine" : "theirs"}>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
          <div className="cr-muted" style={{ fontSize: 12 }}>{m.sender_side === "staff" ? t.centre : t.parentSide} · {m.created_at.slice(0, 16).replace("T", " ")}</div>
        </li>
      ))}</ol>
      <form className="cr-form" onSubmit={send}>
        <div className="cr-field"><label htmlFor={`rep-${threadId}`}>{t.yourMessage}</label>
          <textarea id={`rep-${threadId}`} name="body" rows={3} required maxLength={2000} /></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.send}</button>
          {canClose && status === "open" && <button type="button" className="cr-btn ghost" disabled={busy}
            onClick={async () => { setBusy(true); const r = await call({ action: "close", threadId }); setBusy(false); if (r.ok) router.refresh(); else setMsg(err(r.code)); }}>{t.closeConversation}</button>}
        </div>
      </form>
      <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
    </div>
  );
}

/** Parent: start a new conversation about the selected child. */
export function NewThread({ studentCode, t }: { studentCode: string; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    setBusy(true); setMsg(null);
    const r = await call({ action: "start", studentCode, subject: String(f.get("subject") ?? ""), body: String(f.get("body") ?? "") });
    setBusy(false);
    if (r.ok) { form.reset(); router.push(`/360/parent?child=${encodeURIComponent(studentCode)}&thread=${r.data}#msg-h`); router.refresh(); }
    else setMsg((t as Record<string, string>)[`err_${r.code ?? "server_error"}`] ?? t.err_server_error);
  }
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="cr-btn ghost" style={{ display: "inline-flex", alignItems: "center" }}>✉️ {t.newMessage}</summary>
      <form className="cr-form" onSubmit={start} style={{ marginTop: 8 }}>
        <div className="cr-field"><label htmlFor="nt-s">{t.subject}</label><input id="nt-s" name="subject" required minLength={2} maxLength={120} /></div>
        <div className="cr-field"><label htmlFor="nt-b">{t.yourMessage}</label><textarea id="nt-b" name="body" rows={3} required maxLength={2000} /></div>
        <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.send}</button>
        <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
      </form>
    </details>
  );
}
