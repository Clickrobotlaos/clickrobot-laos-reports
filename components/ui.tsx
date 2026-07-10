"use client";
import { ReactNode } from "react";
import { CURRENCIES, toLAK, fmt } from "@/lib/util";
import { useCompany } from "@/lib/company";

// Colorful emoji icons — replaces the SVG icons for a friendlier look
const EMOJI: Record<string, string> = {
  home: "🏠",
  attendance: "✅",
  check: "✅",
  calendar: "📅",
  users: "👨‍👩‍👧‍👦",
  report: "📊",
  invoice: "🧾",
  coins: "💰",
  badge: "👤",
  pay: "💳",
  gear: "⚙️",
  import: "📥",
  scan: "📷",
};

export function Icon({ n }: { n: string }) {
  const emoji = EMOJI[n] || "•";
  return (
    <span aria-hidden="true" style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 22, height: 22, fontSize: 18, lineHeight: 1, flexShrink: 0,
    }}>
      {emoji}
    </span>
  );
}

export function Brand() {
  const c = useCompany();
  const name = c.name || "ClickRobot Laos";
  return (
    <div className="brand">
      {c.logo_url ? (
        <img
          src={c.logo_url}
          alt={name}
          className="brand-logo"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="mark" aria-hidden="true" />
      )}
      <div><b>{name}</b><small>Report & Record System</small></div>
      <style>{`
        .brand-logo { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
      `}</style>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Sel({ value, onChange, options, allowEmpty }: { value: string; onChange: (v: string) => void; options: string[]; allowEmpty?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">— Select —</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export type MoneyValue = { amount: string | number; currency: string; rate: number };

export function MoneyFields({ v, set, rates }: { v: MoneyValue; set: (v: MoneyValue) => void; rates: Record<string, number> }) {
  const lak = toLAK(v.amount, v.rate);
  return (
    <>
      <div className="frow c3">
        <Field label="Original amount">
          <input type="number" inputMode="decimal" min="0" value={v.amount} onChange={(e) => set({ ...v, amount: e.target.value })} placeholder="0" />
        </Field>
        <Field label="Currency">
          <Sel value={v.currency} options={[...CURRENCIES]} onChange={(c) => set({ ...v, currency: c, rate: rates[c] || 1 })} />
        </Field>
        <Field label={`Exchange rate (1 ${v.currency} → LAK)`}>
          <input type="number" inputMode="decimal" min="0" value={v.rate} disabled={v.currency === "LAK"} onChange={(e) => set({ ...v, rate: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="lakbox">= {fmt(lak)} LAK</div>
    </>
  );
}
