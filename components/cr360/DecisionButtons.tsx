"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";

/** Approve / reject with a required reason for rejection. The database is the authority. */
export function DecisionButtons({ kind, id, t }: { kind: "leave" | "ot" | "correction"; id: string; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/approvals/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "approve" ? { kind, id, action } : { kind, id, action, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { router.refresh(); return; }
      const code = body.reasonCode ?? "server_error";
      setMsg((t as Record<string, string>)[`err_${code}`] ?? t.err_server_error);
      if (code === "already_decided") router.refresh();
    } catch {
      setMsg(t.err_server_error);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 8, width: "100%" }}>
      {!rejecting ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="cr-btn teal" disabled={busy} onClick={() => decide("approve")}>{t.approve}</button>
          <button type="button" className="cr-btn ghost" disabled={busy} onClick={() => setRejecting(true)}>{t.reject}</button>
        </div>
      ) : (
        <div className="cr-form">
          <div className="cr-field">
            <label htmlFor={`rr-${id}`}>{t.rejectReason}</label>
            <textarea id={`rr-${id}`} rows={2} minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="cr-btn" disabled={busy || reason.trim().length < 3} onClick={() => decide("reject")}>{t.confirmReject}</button>
            <button type="button" className="cr-btn ghost" disabled={busy} onClick={() => { setRejecting(false); setReason(""); }}>{t.cancel}</button>
          </div>
        </div>
      )}
      <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
    </div>
  );
}
