"use client";
import { supabase } from "@/lib/supabase";

export type BackupTable = { name: string; rows: any[] };

const ALL_TABLES = [
  "income_records", "expense_records", "student_records", "daily_reports",
  "invoices", "salary_payroll", "student_packages", "attendance",
  "whatsapp_logs", "reminder_logs", "closed_months",
  "branches", "programs", "exchange_rates", "whatsapp_recipients",
  "settings", "users",
];

export async function collectAllData(): Promise<BackupTable[]> {
  const out: BackupTable[] = [];
  for (const t of ALL_TABLES) {
    const { data } = await supabase.from(t).select("*");
    out.push({ name: t, rows: data || [] });
  }
  return out;
}

export async function collectMonthData(month: string): Promise<BackupTable[]> {
  const start = `${month}-01`;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  const tables: [string, boolean][] = [
    ["income_records", true], ["expense_records", true],
    ["student_records", true], ["daily_reports", true],
    ["invoices", true], ["attendance", true],
    ["salary_payroll", false],
  ];
  const out: BackupTable[] = [];
  for (const [t, useDate] of tables) {
    let q = supabase.from(t).select("*");
    if (useDate) q = q.gte("date", start).lt("date", end);
    else q = q.eq("month", month);
    const { data } = await q;
    out.push({ name: t, rows: data || [] });
  }
  return out;
}

export function downloadAllAsCsv(tables: BackupTable[], prefix = "backup") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  for (const t of tables) {
    if (!t.rows.length) continue;
    const cols = Object.keys(t.rows[0]);
    const esc = (x: any) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...t.rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${prefix}-${t.name}-${stamp}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }
}

/** Financial-only wipe (Level 1 — original) */
export async function wipeAllFinancialData(): Promise<{ ok: boolean; error?: string }> {
  const order = [
    "attendance", "student_packages", "student_records",
    "income_records", "invoices", "expense_records",
    "salary_payroll", "daily_reports",
    "whatsapp_logs", "reminder_logs", "closed_months",
  ];
  for (const t of order) {
    const { error } = await supabase.from(t).delete().gte("created_at", "1900-01-01");
    if (error) return { ok: false, error: `${t}: ${error.message}` };
  }
  return { ok: true };
}

/** Deep reset (Level 2 — Server-side RPC) */
export async function deepReset(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_deep_reset");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Nuclear reset (Level 3 — Server-side RPC) */
export async function nuclearReset(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_nuclear_reset");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
