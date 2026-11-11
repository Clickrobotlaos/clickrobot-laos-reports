"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

const CATS = ["Equipment", "Stationery", "Maintenance", "Utilities", "Transportation", "Marketing", "Event Cost", "Rent", "Other"] as const;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
async function call(body: unknown) {
  const res = await fetch("/api/cr360/finance/branch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, code: j.reasonCode as string | undefined };
}
function useAct(t: Dict) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const run = async (body: unknown, okText?: string) => {
    setBusy(true); setMsg(null);
    const r = await call(body);
    setBusy(false);
    if (r.ok) { if (okText) setMsg({ tone: "ok", text: okText }); router.refresh(); return true; }
    setMsg({ tone: "warn", text: r.code === "not_enabled" ? t.financeNotEnabled : (t as Record<string, string>)[`err_${r.code ?? "server_error"}`] ?? t.err_server_error });
    return false;
  };
  return { busy, msg, run };
}

/** Request an expense for one branch (staff of that branch or its manager). */
export function ExpenseRequestForm({ branchId, t }: { branchId: string; t: Dict }) {
  const { busy, msg, run } = useAct(t);
  const [cur, setCur] = useState("LAK");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
    const ok = await run({ action: "request", branchId, category: s("category"), description: s("description"), supplier: s("supplier") || undefined,
      amount: Number(s("amount")), currency: s("currency"), rate: s("rate") ? Number(s("rate")) : undefined, neededBy: s("neededBy") || undefined }, t.submitted);
    if (ok) form.reset();
  }
  return (
    <form className="cr-form" onSubmit={submit}>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="ex-c">{t.category}</label><select id="ex-c" name="category">{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="ex-s">{t.supplier}</label><input id="ex-s" name="supplier" maxLength={120} /></div>
      </div>
      <div className="cr-field"><label htmlFor="ex-d">{t.whatFor}</label><input id="ex-d" name="description" required minLength={3} maxLength={500} /></div>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="ex-a">{t.amount}</label><input id="ex-a" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></div>
        <div className="cr-field"><label htmlFor="ex-cu">{t.currency}</label>
          <select id="ex-cu" name="currency" value={cur} onChange={(e) => setCur(e.target.value)}><option>LAK</option><option>THB</option><option>USD</option></select></div>
        {cur !== "LAK" && <div className="cr-field"><label htmlFor="ex-r">{t.rateToLak}</label><input id="ex-r" name="rate" type="number" min="0.0001" step="0.0001" required /></div>}
      </div>
      <div className="cr-field"><label htmlFor="ex-n">{t.neededBy}</label><input id="ex-n" name="neededBy" type="date" min={today()} /></div>
      <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.requestExpense}</button>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </form>
  );
}

export interface ExpenseRow { id: string; branch: string; category: string; description: string; amount: number; currency: string; amount_lak: number; status: string; mine: boolean; created_at: string }

/** Requests list with the actions the database will allow (it re-checks every one). */
export function ExpenseQueue({ rows, canDecide, canPay, t }: { rows: ExpenseRow[]; canDecide: boolean; canPay: boolean; t: Dict }) {
  const { busy, msg, run } = useAct(t);
  if (rows.length === 0) return <p className="cr-muted">{t.noExpenseRequests}</p>;
  const small = { minHeight: 36, padding: "0 10px", fontSize: 13 } as const;
  return (
    <>
      <ul className="cr-list">{rows.map((r) => (
        <li key={r.id}>
          <span><b>{r.description}</b><br /><span className="cr-muted">{r.branch} · {r.category} · {Number(r.amount).toLocaleString()} {r.currency}{r.currency !== "LAK" ? ` (≈ ${Number(r.amount_lak).toLocaleString()} LAK)` : ""}</span></span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <span className={`cr-badge ${r.status === "paid" || r.status === "approved" ? "approved" : r.status === "pending" ? "pending" : "rejected"}`}>{t[`exSt_${r.status as "pending"}`] ?? r.status}</span>
            {r.status === "pending" && canDecide && !r.mine && <>
              <button type="button" className="cr-btn teal" style={small} disabled={busy} onClick={() => run({ action: "approve", id: r.id })}>{t.approve}</button>
              <button type="button" className="cr-btn ghost" style={small} disabled={busy} onClick={() => { const n = window.prompt(t.rejectReasonPrompt) ?? ""; if (n.trim().length >= 3) void run({ action: "reject", id: r.id, note: n }); }}>{t.reject}</button>
            </>}
            {r.status === "pending" && r.mine && <button type="button" className="cr-btn ghost" style={small} disabled={busy} onClick={() => run({ action: "cancel", id: r.id })}>{t.cancel}</button>}
            {r.status === "approved" && canPay && <>
              {(["Cash", "Bank Transfer", "QR Payment"] as const).map((m) => (
                <button key={m} type="button" className="cr-btn ghost" style={small} disabled={busy} onClick={() => run({ action: "pay", id: r.id, method: m, date: today() })}>{t.paidBy} {m}</button>
              ))}
            </>}
          </span>
        </li>
      ))}</ul>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </>
  );
}

/** End-of-day cash count. */
export function CashCountForm({ branchId, date, hasCount, t }: { branchId: string; date: string; hasCount: boolean; t: Dict }) {
  const { busy, msg, run } = useAct(t);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget); const n = (k: string) => (String(f.get(k) ?? "").trim() === "" ? undefined : Number(f.get(k)));
    await run({ action: "count", branchId, date, counted: { LAK: n("LAK"), THB: n("THB"), USD: n("USD") }, note: String(f.get("note") ?? "").trim() || undefined }, t.saved);
  }
  return (
    <form className="cr-form" onSubmit={submit}>
      <div className="cr-row">{(["LAK", "THB", "USD"] as const).map((c) => (
        <div key={c} className="cr-field"><label htmlFor={`cc-${c}`}>{t.counted} {c}</label><input id={`cc-${c}`} name={c} type="number" min="0" step="0.01" inputMode="decimal" required={c === "LAK"} /></div>
      ))}</div>
      <div className="cr-field"><label htmlFor="cc-n">{hasCount ? t.recountReason : t.noteOptional}</label><input id="cc-n" name="note" maxLength={300} required={hasCount} minLength={hasCount ? 3 : undefined} /></div>
      <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : hasCount ? t.recount : t.saveCount}</button>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </form>
  );
}

/** CEO: manager approval limit. */
export function ManagerLimitForm({ current, t }: { current: number | null; t: Dict }) {
  const { busy, msg, run } = useAct(t);
  return (
    <form className="cr-form" onSubmit={(e) => { e.preventDefault(); void run({ action: "limit", lak: Number(new FormData(e.currentTarget).get("lak")) }, t.saved); }}>
      <div className="cr-field"><label htmlFor="ml">{t.managerLimit}</label>
        <input id="ml" name="lak" type="number" min="0" step="1000" defaultValue={current ?? 0} required /></div>
      <p className="cr-muted">{t.managerLimitNote}</p>
      <button className="cr-btn ghost" type="submit" disabled={busy}>{t.save}</button>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </form>
  );
}
