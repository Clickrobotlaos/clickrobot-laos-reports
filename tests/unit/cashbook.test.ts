import { describe, expect, it } from "vitest";
import { cashDifference, cashbookTotals } from "@/lib/cr360/cashbook";

describe("daily cashbook", () => {
  const income = [{ amount: 1000000, currency: "LAK", payment_method: "Cash" }, { amount: 500000, currency: "LAK", payment_method: "Bank Transfer" }, { amount: 20, currency: "USD", payment_method: "Cash" }];
  const expense = [{ amount: 300000, currency: "LAK", payment_method: "Cash" }, { amount: 0.1, currency: "USD", payment_method: "Cash" }, { amount: 0.2, currency: "USD", payment_method: "Cash" }];
  it("totals per method and currency; system cash = cash in − cash out, currencies never mixed", () => {
    const r = cashbookTotals(income, expense);
    expect(r.byMethod["Bank Transfer"].in).toEqual({ LAK: 500000 });
    expect(r.systemCash).toEqual({ LAK: 700000, USD: 19.7 });
  });
  it("difference = counted − system per currency", () => {
    expect(cashDifference({ LAK: 680000 }, { LAK: 700000, USD: 19.7 })).toEqual({ LAK: -20000, USD: -19.7 });
  });
});
