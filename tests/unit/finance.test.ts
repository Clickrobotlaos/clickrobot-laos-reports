import { describe, expect, it } from "vitest";
import { kip, monthBounds, rateInconsistent, summarise, toCents } from "@/lib/cr360/finance";
import { MarkPaidInput } from "@/lib/cr360/schemas";

// FICTIONAL amounts.
const inc = (o: Record<string, unknown>) => ({ id: Math.random().toString(36), date: "2026-11-05", branch_id: "A", amount: 100000, currency: "LAK", rate_to_lak: 1, amount_lak: 100000, unpaid_lak: 0, payment_method: "Cash", ...o });
const exp = (o: Record<string, unknown>) => ({ id: Math.random().toString(36), date: "2026-11-05", branch_id: "A", category: "Rent", amount: 40000, currency: "LAK", rate_to_lak: 1, amount_lak: 40000, ...o });

describe("money helpers", () => {
  it("aggregates in integer cents without float drift", () => {
    const rows = Array.from({ length: 10 }, () => inc({ amount_lak: 0.1 }));
    expect(summarise({ income: rows, expenses: [], invoices: [], today: "2026-11-10" }).incomeLak).toBe(100n);
    expect(toCents("1234.565")).toBe(123457n);
    expect(toCents(null)).toBe(0n);
    expect(toCents("abc")).toBe(0n);
    expect(kip(123450n)).toBe(1235);
  });
  it("month bounds handle December and reject bad input", () => {
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(() => monthBounds("2026-13")).toThrow();
    expect(() => monthBounds("2026-1")).toThrow();
  });
  it("flags rows whose stored LAK disagrees with amount × rate", () => {
    expect(rateInconsistent({ amount: 10, currency: "USD", rate_to_lak: 21950, amount_lak: 219500 })).toBe(false);
    expect(rateInconsistent({ amount: 10, currency: "USD", rate_to_lak: 21950, amount_lak: 200000 })).toBe(true);
    expect(rateInconsistent({ amount: 5000, currency: "LAK", rate_to_lak: null, amount_lak: 5000 })).toBe(false);
  });
});

describe("operational summary", () => {
  const s = summarise({
    income: [inc({}), inc({ branch_id: "B", amount: 10, currency: "USD", rate_to_lak: 21950, amount_lak: 219500, payment_method: "Bank Transfer" }), inc({ branch_id: null, unpaid_lak: 5000 })],
    expenses: [exp({}), exp({ category: "Salary", amount_lak: 60000, amount: 60000 }), exp({ branch_id: "B", amount_lak: 999, amount: 1, currency: "USD", rate_to_lak: 21950 })],
    invoices: [
      { id: "1", branch_id: "A", status: "Sent", amount_lak: 300000, due_date: "2026-11-01", date: "2026-10-25" },
      { id: "2", branch_id: "A", status: "Draft", amount_lak: 100000, due_date: "2026-12-01", date: "2026-11-01" },
      { id: "3", branch_id: "A", status: "Paid", amount_lak: 999999, due_date: "2026-10-01", date: "2026-10-01" },
    ],
    today: "2026-11-10",
  });
  it("totals, net and unpaid", () => {
    expect(kip(s.incomeLak)).toBe(419500);
    expect(kip(s.expenseLak)).toBe(100999);
    expect(kip(s.netLak)).toBe(318501);
    expect(kip(s.unpaidLak)).toBe(5000);
  });
  it("open and overdue invoices exclude Paid", () => {
    expect(s.openInvoices).toBe(2);
    expect(kip(s.openInvoicesLak)).toBe(400000);
    expect(s.overdueInvoices).toBe(1);
  });
  it("breakdowns keep original currency and sort by size", () => {
    expect(s.byBranch[0].branch).toBe("B");
    expect(s.expenseByCategory.map((c) => c.key)).toEqual(["Salary", "Rent"]); // 60,000 > 40,000 + 999
    expect(s.incomeByCurrency.find((c) => c.key === "USD")?.lak).toBe(1000n);
    expect(s.incomeByMethod.map((m) => m.key)).toContain("Bank Transfer");
  });
  it("data-quality counters", () => {
    expect(s.dataQuality).toEqual({ incomeRateMismatch: 0, expenseRateMismatch: 1, unassignedBranch: 1 });
  });
});

describe("record-payment contract", () => {
  const invoiceId = "51000000-0000-4000-8000-000000000001";
  it("accepts only known methods and no client-side amounts/status", () => {
    expect(MarkPaidInput.safeParse({ invoiceId, method: "Cash" }).success).toBe(true);
    expect(MarkPaidInput.safeParse({ invoiceId, method: "Crypto" }).success).toBe(false);
    expect(MarkPaidInput.safeParse({ invoiceId, method: "Cash", amount: 1 }).success).toBe(false);
    expect(MarkPaidInput.safeParse({ invoiceId, method: "Cash", status: "Paid" }).success).toBe(false);
    expect(MarkPaidInput.safeParse({ invoiceId: "x", method: "Cash" }).success).toBe(false);
  });
});
