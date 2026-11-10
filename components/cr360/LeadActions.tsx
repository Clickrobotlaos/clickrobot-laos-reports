"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";
import type { LeadAction } from "@/lib/cr360/crm";

const FOR_STAGE: Record<string, LeadAction[]> = {
  New: ["contacted", "lost"],
  Contacted: ["contacted", "lost"],
  TrialBooked: ["attended", "noshow", "lost"],
  TrialAttended: ["lost"],
  Lost: ["reopen"],
  Registered: [],
};

export function LeadActions({ leadId, status, t }: { leadId: string; status: string; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: LeadAction) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/crm/lead-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action, expectedStatus: status, ...(action === "lost" ? { reason } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setLosing(false); setReason(""); router.refresh(); return; }
      setMsg((t as Record<string, string>)[`err_${j.reasonCode}`] ?? t.err_server_error);
      if (j.reasonCode === "already_decided") router.refresh();
    } catch { setMsg(t.err_server_error); } finally { setBusy(false); }
  }

  const actions = FOR_STAGE[status] ?? [];
  if (actions.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {losing ? (
        <div className="cr-form">
          <div className="cr-field"><label htmlFor={`lr-${leadId}`}>{t.lostReason}</label>
            <input id={`lr-${leadId}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="cr-btn" disabled={busy || reason.trim().length < 3} onClick={() => run("lost")}>{t.act_lost}</button>
            <button type="button" className="cr-btn ghost" onClick={() => { setLosing(false); setReason(""); }}>{t.cancel}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {actions.map((a) => (
            <button key={a} type="button" className={`cr-btn ${a === "lost" ? "ghost" : a === "noshow" ? "ghost" : "teal"}`}
              style={{ minHeight: 40, padding: "0 12px", fontSize: 13.5 }} disabled={busy}
              onClick={() => (a === "lost" ? setLosing(true) : run(a))}>{t[`act_${a}`]}</button>
          ))}
        </div>
      )}
      <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
    </div>
  );
}
