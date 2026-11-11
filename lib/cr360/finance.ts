/**
 * Operational finance summary over LEGACY income/expense/invoice rows (pure, no I/O).
 * Legacy stores amounts as numeric with a per-row rate and a pre-computed amount_lak.
 * We aggregate in integer kip-cents (bigint) to avoid float drift, keep original currencies,
 * and flag rows whose stored LAK value disagrees with amount × rate (data-quality signal).
 * NOT a reconciled ledger: no payment allocation, no bank reconciliation, no close.
 */
export interface IncomeRow { id: string; date: string; branch_id: string | null; amount: number | string | null; currency: string | null; rate_to_lak: number | string | null; amount_lak: number | string | null; unpaid_lak?: number | string | null; payment_method: string | null }
export interface ExpenseRow { id: string; date: string; branch_id: string | null; category: string | null; amount: number | string | null; currency: string | null; rate_to_lak: number | string | null; amount_lak: number | string | null }
export interface InvoiceRow { id: string; branch_id: string | null; status: string | null; amount_lak: number | string | null; due_date: string | null; date: string | null; invoice_no?: string | null; student_name?: string | null; amount?: number | string | null; currency?: string | null }

/** numeric → kip-cents (bigint). Rounds half away from zero at the cent. Non-finite → 0n. */
export function toCents(v: number | string | null | undefined): bigint {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * 100));
}

export function kip(c: bigint): number {
  // Display helper (whole kip). Safe for realistic totals (< 9e15 kip).
  return Number(c / 100n) + (c % 100n >= 50n ? 1 : 0);
}

/** |amount × rate − amount_lak| > 1 kip → inconsistent (LAK rows must have rate 1 or amount_lak = amount). */
export function rateInconsistent(r: { amount: number | string | null; rate_to_lak: number | string | null; amount_lak: number | string | null; currency: string | null }): boolean {
  const amt = Number(r.amount ?? 0), rate = Number(r.currency === "LAK" ? 1 : r.rate_to_lak ?? 0), lak = Number(r.amount_lak ?? 0);
  if (![amt, rate, lak].every(Number.isFinite)) return true;
  return Math.abs(amt * rate - lak) > 1;
}

export const INVOICE_OPEN = ["Draft", "Sent"];

export function monthBounds(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month");
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) throw new Error("Invalid month");
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return { start: `${month}-01`, end: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

export function summarise(args: { income: IncomeRow[]; expenses: ExpenseRow[]; invoices: InvoiceRow[]; today: string }) {
  const sum = <T,>(rows: T[], f: (r: T) => bigint) => rows.reduce((a, r) => a + f(r), 0n);
  const incomeLak = sum(args.income, (r) => toCents(r.amount_lak));
  const expenseLak = sum(args.expenses, (r) => toCents(r.amount_lak));
  const unpaidLak = sum(args.income, (r) => toCents(r.unpaid_lak ?? 0));
  const open = args.invoices.filter((i) => INVOICE_OPEN.includes(i.status ?? ""));
  const overdue = open.filter((i) => i.due_date && i.due_date < args.today);

  const branchKeys = new Set<string>([...args.income, ...args.expenses].map((r) => r.branch_id ?? "unassigned"));
  const byBranch = [...branchKeys].map((b) => {
    const inc = sum(args.income.filter((r) => (r.branch_id ?? "unassigned") === b), (r) => toCents(r.amount_lak));
    const exp = sum(args.expenses.filter((r) => (r.branch_id ?? "unassigned") === b), (r) => toCents(r.amount_lak));
    return { branch: b, income: inc, expenses: exp, net: inc - exp };
  }).sort((a, b) => (b.income > a.income ? 1 : b.income < a.income ? -1 : 0));

  const group = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => bigint) => {
    const m = new Map<string, bigint>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0n) + val(r));
    return [...m.entries()].map(([k, v]) => ({ key: k, lak: v })).sort((a, b) => (b.lak > a.lak ? 1 : b.lak < a.lak ? -1 : 0));
  };

  return {
    incomeLak, expenseLak, netLak: incomeLak - expenseLak, unpaidLak,
    openInvoices: open.length, openInvoicesLak: sum(open, (r) => toCents(r.amount_lak)),
    overdueInvoices: overdue.length, overdueLak: sum(overdue, (r) => toCents(r.amount_lak)),
    byBranch,
    expenseByCategory: group(args.expenses, (r) => r.category ?? "Other", (r) => toCents(r.amount_lak)),
    incomeByMethod: group(args.income, (r) => r.payment_method ?? "Other", (r) => toCents(r.amount_lak)),
    /** Original-currency totals (never converted), e.g. { USD: 12000n cents }. */
    incomeByCurrency: group(args.income, (r) => r.currency ?? "?", (r) => toCents(r.amount)),
    dataQuality: {
      incomeRateMismatch: args.income.filter(rateInconsistent).length,
      expenseRateMismatch: args.expenses.filter(rateInconsistent).length,
      unassignedBranch: [...args.income, ...args.expenses].filter((r) => !r.branch_id).length,
    },
  };
}
