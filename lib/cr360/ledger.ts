/**
 * Session package ledger — append-only. Balance is DERIVED, never stored/edited.
 * Production enforcement: unique (student_id, class_session_id, charge_kind) in the DB
 * (see supabase/proposed/0003_session_ledger.sql). This module is the pure model used
 * by tests and by the server before calling the atomic RPC.
 */
export type LedgerKind = "purchase" | "attendance" | "reversal" | "makeup_credit" | "makeup_use" | "expiry" | "refund" | "bonus";

export interface LedgerEntry {
  id: string;
  packageId: string;
  studentId: string;
  classSessionId?: string;
  kind: LedgerKind;
  /** +credit / -debit, in sessions. */
  delta: number;
  /** Entry this one compensates (reversals only). */
  reverses?: string;
  actorId: string;
  reason?: string;
  at: string;
}

export function balance(entries: LedgerEntry[], packageId: string): number {
  const sum = entries.filter((e) => e.packageId === packageId).reduce((a, e) => a + e.delta, 0);
  if (!Number.isSafeInteger(sum)) throw new Error("Session balance overflow");
  return sum;
}

/** An attendance debit that has not been reversed. */
function liveDebit(entries: LedgerEntry[], studentId: string, classSessionId: string) {
  const reversed = new Set(entries.filter((e) => e.kind === "reversal").map((e) => e.reverses));
  return entries.find(
    (e) => e.kind === "attendance" && e.studentId === studentId && e.classSessionId === classSessionId && !reversed.has(e.id),
  );
}

export type DebitResult =
  | { ok: true; entry: LedgerEntry }
  | { ok: false; code: "duplicate" | "no_balance" };

/** Idempotent: a second "present" for the same student+session is a no-op. */
export function debitForAttendance(
  entries: LedgerEntry[],
  args: { id: string; packageId: string; studentId: string; classSessionId: string; actorId: string; at: string },
): DebitResult {
  if (liveDebit(entries, args.studentId, args.classSessionId)) return { ok: false, code: "duplicate" };
  if (balance(entries, args.packageId) <= 0) return { ok: false, code: "no_balance" };
  return { ok: true, entry: { ...args, kind: "attendance", delta: -1 } };
}

export type ReverseResult = { ok: true; entry: LedgerEntry } | { ok: false; code: "not_found" | "reason_required" };

/** Undo = compensating credit with reason; original row is never touched. */
export function reverseAttendance(
  entries: LedgerEntry[],
  args: { id: string; studentId: string; classSessionId: string; actorId: string; reason: string; at: string },
): ReverseResult {
  if (!args.reason || args.reason.trim().length < 3) return { ok: false, code: "reason_required" };
  const d = liveDebit(entries, args.studentId, args.classSessionId);
  if (!d) return { ok: false, code: "not_found" };
  return {
    ok: true,
    entry: {
      id: args.id, packageId: d.packageId, studentId: d.studentId, classSessionId: d.classSessionId,
      kind: "reversal", delta: 1, reverses: d.id, actorId: args.actorId, reason: args.reason, at: args.at,
    },
  };
}
