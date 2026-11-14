"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";

/** CEO: set one category's budget inline. */
export function BudgetEditor({ branchId, month, category, current, t }: { branchId: string; month: string; category: string; current: number | null; t: Dict }) {
  const router = useRouter();
  const [v, setV] = useState(current === null ? "" : String(current));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  async function save() {
    setBusy(true); setErr(false);
    try {
      const res = await fetch("/api/cr360/finance/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId, month, category, amount: Number(v || 0) }) });
      if (res.ok) router.refresh(); else setErr(true);
    } catch { setErr(true); } finally { setBusy(false); }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input aria-label={`${t.budgetLak} ${category}`} type="number" min="0" step="10000" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 130, minHeight: 36 }} />
      <button type="button" className="cr-btn ghost" style={{ minHeight: 36, padding: "0 10px" }} disabled={busy} onClick={save}>{t.save}</button>
      {err && <span className="cr-badge rejected">!</span>}
    </span>
  );
}
