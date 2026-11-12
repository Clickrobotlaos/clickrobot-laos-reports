"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export interface StockRow { item_id: string; sku: string; name: string; category: string; unit: string; reorder_level: number; on_hand: number }
const KINDS = ["receive", "issue", "transfer", "adjust_up", "adjust_down", "damaged", "lost"] as const;

function useCall(t: Dict) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const run = async (body: unknown) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: j.reasonCode === "not_enabled" ? t.inventoryNotEnabled : (t as Record<string, string>)[`err_${j.reasonCode ?? "server_error"}`] ?? t.err_server_error }); return false; }
      setMsg({ tone: "ok", text: t.saved }); router.refresh(); return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; } finally { setBusy(false); }
  };
  return { busy, msg, run };
}

/** Branch manager / CEO: record a stock movement. */
export function StockMoveForm({ branchId, items, branches, t }: { branchId: string; items: StockRow[]; branches: { id: string; name: string }[]; t: Dict }) {
  const { busy, msg, run } = useCall(t);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("receive");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
    if (await run({ action: "move", itemId: s("item"), branchId, kind, qty: Number(s("qty")), note: s("note") || undefined, toBranchId: kind === "transfer" ? s("to") : undefined })) form.reset();
  }
  const needsNote = kind === "adjust_up" || kind === "adjust_down" || kind === "damaged" || kind === "lost";
  return (
    <form className="cr-form" onSubmit={submit}>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="mv-i">{t.item}</label><select id="mv-i" name="item" required>{items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name} ({i.sku})</option>)}</select></div>
        <div className="cr-field"><label htmlFor="mv-k">{t.movement}</label>
          <select id="mv-k" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>{KINDS.map((k) => <option key={k} value={k}>{t[`mv_${k}`]}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="mv-q">{t.quantity}</label><input id="mv-q" name="qty" type="number" min="1" max="100000" step="1" required /></div>
      </div>
      {kind === "transfer" && <div className="cr-field"><label htmlFor="mv-to">{t.toBranch}</label>
        <select id="mv-to" name="to" required>{branches.filter((b) => b.id !== branchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
      <div className="cr-field"><label htmlFor="mv-n">{needsNote ? t.reason : t.noteOptional}</label><input id="mv-n" name="note" maxLength={300} required={needsNote} minLength={needsNote ? 3 : undefined} /></div>
      <button className="cr-btn" type="submit" disabled={busy || items.length === 0}>{busy ? t.submitting : t.recordMovement}</button>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </form>
  );
}

/** CEO: add an item to the catalogue. */
export function ItemForm({ t }: { t: Dict }) {
  const { busy, msg, run } = useCall(t);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
    if (await run({ action: "item", sku: s("sku"), name: s("name"), category: s("category"), unit: s("unit") || "pcs", reorder: Number(s("reorder") || 0) })) form.reset();
  }
  return (
    <form className="cr-form" onSubmit={submit}>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="it-s">SKU</label><input id="it-s" name="sku" required pattern="[A-Za-z0-9][A-Za-z0-9-]{1,39}" placeholder="SPK-001" /></div>
        <div className="cr-field"><label htmlFor="it-n">{t.item}</label><input id="it-n" name="name" required minLength={2} maxLength={120} /></div>
      </div>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="it-c">{t.category}</label><select id="it-c" name="category">{(["kit", "part", "consumable", "device", "other"] as const).map((c) => <option key={c} value={c}>{t[`invc_${c}`]}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="it-u">{t.unit}</label><input id="it-u" name="unit" defaultValue="pcs" maxLength={12} /></div>
        <div className="cr-field"><label htmlFor="it-r">{t.reorderLevel}</label><input id="it-r" name="reorder" type="number" min="0" defaultValue="0" /></div>
      </div>
      <button className="cr-btn ghost" type="submit" disabled={busy}>{t.addItem}</button>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </form>
  );
}
