"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface LinkRow {
  id: string; guardian_email: string | null; relationship: string; created_at: string;
  verified_at: string | null; consent_version: string | null; revoked_at: string | null; revoke_reason: string | null;
}

const RELS = ["mother", "father", "guardian", "grandparent", "other"] as const;

/** Manager UI for verified guardian links. Every rule is enforced again by the DB functions (0005). */
export function GuardianPanel({ studentCode, links, consentVersion, t }: {
  studentCode: string; links: LinkRow[]; consentVersion: string | null; t: Dict;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [agree, setAgree] = useState(false);

  const err = (code?: string) => (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;

  async function call(path: string, body: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/cr360/guardians/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: err(j.reasonCode) }); return false; }
      router.refresh();
      return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; }
    finally { setBusy(false); }
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await call("link", { studentCode, email: String(f.get("email") ?? ""), relationship: String(f.get("relationship") ?? "guardian") });
    if (ok) { form.reset(); setMsg({ tone: "ok", text: t.linkPending }); }
  }

  return (
    <div>
      <p className="cr-muted">{t.parentAccessHint}</p>
      {!consentVersion && <div className="cr-banner warn">{t.consentNotConfigured}</div>}
      {links.length === 0 ? <p className="cr-muted">{t.noLinks}</p> : (
        <ul className="cr-list">{links.map((l) => {
          const state = l.revoked_at ? "revoked" : l.verified_at ? "verified" : "pending";
          return (
            <li key={l.id} style={{ display: "grid", gap: 8, justifyContent: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span><b>{l.guardian_email ?? "—"}</b> · {l.relationship}</span>
                <span className={`cr-badge ${state === "verified" ? "approved" : state === "revoked" ? "rejected" : "pending"}`}>
                  {state === "verified" ? `${t.linkVerified} (${l.consent_version})` : state === "revoked" ? t.linkRevoked : t.linkPending}
                </span>
              </div>
              {state === "pending" && consentVersion && (confirming === l.id ? (
                <div className="cr-form">
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 22, height: 22, minHeight: 0 }} />
                    <span>{t.confirmIdentity} <b>{consentVersion}</b>.</span>
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="cr-btn teal" disabled={busy || !agree} onClick={async () => {
                      if (await call("verify", { linkId: l.id, confirmed: true })) { setConfirming(null); setAgree(false); }
                    }}>{t.verifyLink}</button>
                    <button type="button" className="cr-btn ghost" onClick={() => { setConfirming(null); setAgree(false); }}>{t.cancel}</button>
                  </div>
                </div>
              ) : null)}
              {state !== "revoked" && (revoking === l.id ? (
                <div className="cr-form">
                  <div className="cr-field"><label htmlFor={`r-${l.id}`}>{t.revokeReason}</label>
                    <input id={`r-${l.id}`} value={reason} minLength={3} maxLength={500} onChange={(e) => setReason(e.target.value)} /></div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="cr-btn" disabled={busy || reason.trim().length < 3} onClick={async () => {
                      if (await call("revoke", { linkId: l.id, reason })) { setRevoking(null); setReason(""); }
                    }}>{t.revokeLink}</button>
                    <button type="button" className="cr-btn ghost" onClick={() => { setRevoking(null); setReason(""); }}>{t.cancel}</button>
                  </div>
                </div>
              ) : null)}
              {state !== "revoked" && confirming !== l.id && revoking !== l.id && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {state === "pending" && consentVersion && (
                    <button type="button" className="cr-btn teal" onClick={() => { setConfirming(l.id); setAgree(false); setRevoking(null); }}>{t.verifyLink}</button>
                  )}
                  <button type="button" className="cr-btn ghost" onClick={() => { setRevoking(l.id); setConfirming(null); }}>{t.revokeLink}</button>
                </div>
              )}
              {state === "revoked" && l.revoke_reason && <span className="cr-muted">{l.revoke_reason}</span>}
            </li>
          );
        })}</ul>
      )}
      <form className="cr-form" onSubmit={add} style={{ marginTop: 12 }}>
        <div className="cr-row">
          <div className="cr-field"><label htmlFor="g-email">{t.guardianEmail}</label><input id="g-email" name="email" type="email" required maxLength={254} autoComplete="off" /></div>
          <div className="cr-field"><label htmlFor="g-rel">{t.relationship}</label>
            <select id="g-rel" name="relationship" defaultValue="guardian">{RELS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
        </div>
        <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.addLink}</button>
      </form>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}
