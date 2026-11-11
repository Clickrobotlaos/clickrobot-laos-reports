"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";

const METHODS = ["Cash", "Bank Transfer", "QR Payment", "Other"] as const;

/** Records a payment already received (never transfers money). Server + DB enforce everything. */
export function MarkPaid({ invoiceId, label, t }: { invoiceId: string; label: string; t: Dict }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("Cash");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/finance/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, method }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setOpen(false); router.refresh(); return; }
      setMsg(j.reasonCode === "not_enabled" ? t.paymentsNotEnabled : (t as Record<string, string>)[`err_${j.reasonCode}`] ?? t.err_server_error);
    } catch { setMsg(t.err_server_error); } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="cr-btn ghost" style={{ minHeight: 40, padding: "0 12px", fontSize: 13.5 }} onClick={() => setOpen(true)}>{t.recordPayment}</button>;
  return (
    <div className="cr-form" style={{ minWidth: 220 }}>
      <div className="cr-field">
        <label htmlFor={`pm-${invoiceId}`}>{t.paymentMethod} · {label}</label>
        <select id={`pm-${invoiceId}`} value={method} onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}>
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="cr-btn teal" disabled={busy} onClick={submit}>{busy ? t.submitting : t.confirmPaid}</button>
        <button type="button" className="cr-btn ghost" onClick={() => { setOpen(false); setMsg(null); }}>{t.cancel}</button>
      </div>
      <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
    </div>
  );
}
