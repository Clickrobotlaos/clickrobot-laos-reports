/**
 * Payroll run state machine with separation of duties.
 * draft -> review -> approved -> paid. "paid" records that a human paid outside the system;
 * this application NEVER transfers money. No Lao statutory defaults are assumed.
 */
export type RunStatus = "draft" | "review" | "approved" | "paid";

export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  status: RunStatus;
  preparedBy: string;
  reviewedBy?: string;
  approvedBy?: string;
  locked: boolean;
  version: number;
}

type Action = "submit_review" | "approve" | "mark_paid";

export type TransitionResult = { ok: true; run: PayrollRun } | { ok: false; code: "bad_state" | "same_person" | "stale" | "locked" };

export function transition(run: PayrollRun, action: Action, actorId: string, expectedVersion: number): TransitionResult {
  if (expectedVersion !== run.version) return { ok: false, code: "stale" };
  const next = { ...run, version: run.version + 1 };
  switch (action) {
    case "submit_review":
      if (run.status !== "draft") return { ok: false, code: "bad_state" };
      if (actorId !== run.preparedBy) return { ok: false, code: "bad_state" };
      return { ok: true, run: { ...next, status: "review" } };
    case "approve":
      if (run.status !== "review") return { ok: false, code: "bad_state" };
      if (actorId === run.preparedBy) return { ok: false, code: "same_person" };
      return { ok: true, run: { ...next, status: "approved", approvedBy: actorId, reviewedBy: actorId, locked: true } };
    case "mark_paid":
      if (run.status !== "approved") return { ok: false, code: "bad_state" };
      if (actorId === run.approvedBy) return { ok: false, code: "same_person" }; // two-person release
      return { ok: true, run: { ...next, status: "paid" } };
  }
}

/** Editing lines is only allowed while draft and unlocked. */
export function canEditLines(run: PayrollRun): boolean {
  return run.status === "draft" && !run.locked;
}

export function draftNet(args: { baseMinor: bigint; approvedBonusMinor: bigint; approvedOtMinor: bigint; lawfulDeductionMinor: bigint }): bigint {
  const parts = [args.baseMinor, args.approvedBonusMinor, args.approvedOtMinor, args.lawfulDeductionMinor];
  if (parts.some((x) => x < 0n)) throw new Error("Negative component");
  const net = args.baseMinor + args.approvedBonusMinor + args.approvedOtMinor - args.lawfulDeductionMinor;
  if (net < 0n) throw new Error("Negative payable amount requires review");
  return net;
}
