/** Daily cashbook totals (pure). Amounts stay in their own currency; never mixed without a rate. */
export interface CashLine { amount: number; currency: string; payment_method: string | null }
export type ByCurrency = Record<string, number>;

const add = (m: ByCurrency, c: string, v: number) => { m[c] = Math.round(((m[c] ?? 0) + v) * 100) / 100; };

export function cashbookTotals(income: CashLine[], expense: CashLine[]) {
  const byMethod: Record<string, { in: ByCurrency; out: ByCurrency }> = {};
  const cashIn: ByCurrency = {}, cashOut: ByCurrency = {};
  for (const [rows, dir] of [[income, "in"], [expense, "out"]] as const) {
    for (const r of rows) {
      const m = r.payment_method || "Other";
      byMethod[m] ??= { in: {}, out: {} };
      add(byMethod[m][dir], r.currency, Number(r.amount));
      if (m === "Cash") add(dir === "in" ? cashIn : cashOut, r.currency, Number(r.amount));
    }
  }
  const systemCash: ByCurrency = {};
  for (const c of new Set([...Object.keys(cashIn), ...Object.keys(cashOut)])) systemCash[c] = Math.round(((cashIn[c] ?? 0) - (cashOut[c] ?? 0)) * 100) / 100;
  return { byMethod, cashIn, cashOut, systemCash };
}

/** counted − system, per currency present in either. */
export function cashDifference(counted: ByCurrency, system: ByCurrency): ByCurrency {
  const out: ByCurrency = {};
  for (const c of new Set([...Object.keys(counted), ...Object.keys(system)])) out[c] = Math.round(((counted[c] ?? 0) - (system[c] ?? 0)) * 100) / 100;
  return out;
}
