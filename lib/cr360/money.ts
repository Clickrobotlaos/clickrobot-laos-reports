/**
 * Money: integer minor units (bigint) + currency + exchange-rate snapshot.
 * LAK and THB/USD are stored with 2 minor digits for uniformity; display rounds LAK to 0.
 * Rates are snapshots with source + effective date — never "current rate" assumptions.
 */
import type { Currency } from "./types";

export interface Money { amountMinor: bigint; currency: Currency }
export interface RateSnapshot { currency: Currency; lakPerUnit: string; effectiveDate: string; source: string }

const MINOR = 100n;

/** Parse a decimal string like "1234.50" exactly (no float). */
export function parseMinor(input: string): bigint {
  const s = input.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount");
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const v = BigInt(i) * MINOR + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

export function formatMinor(m: Money, locale = "en-US"): string {
  const neg = m.amountMinor < 0n;
  const abs = neg ? -m.amountMinor : m.amountMinor;
  const whole = abs / MINOR, frac = abs % MINOR;
  const digits = m.currency === "LAK" ? 0 : 2;
  const n = Number(whole) + Number(frac) / 100;
  return `${neg ? "-" : ""}${n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${m.currency}`;
}

/** Convert to LAK using a snapshot; rounds half-up to the minor unit. Rate given as decimal string. */
export function toLakMinor(m: Money, snap: RateSnapshot): bigint {
  if (m.currency === "LAK") return m.amountMinor;
  if (snap.currency !== m.currency) throw new Error("Rate snapshot currency mismatch");
  const rateScaled = parseRate(snap.lakPerUnit); // rate * 1e6
  const num = m.amountMinor * rateScaled;
  const q = num / 1_000_000n, r = num % 1_000_000n;
  return r * 2n >= 1_000_000n ? q + 1n : q;
}

function parseRate(s: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error("Invalid rate");
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6));
}
