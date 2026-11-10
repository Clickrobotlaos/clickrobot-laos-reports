/**
 * Zod input contracts for the cr360 API (docs/04_API_AND_EVENTS.md).
 * Ownership fields (employee_id, branch_id, role) are NEVER accepted from the client;
 * the server derives them from auth.uid().
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const reason = z.string().trim().min(3).max(1000);

export const ClockInput = z.object({
  action: z.enum(["in", "out"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reportedAccuracyM: z.number().positive().max(100000),
  /** Client nonce for replay/double-tap diagnostics; the DB sequence check is authoritative. */
  nonce: z.string().min(8).max(64),
}).strict();

export const LeaveInput = z.object({
  type: z.enum(["annual", "sick", "personal", "unpaid", "other"]),
  startDate: isoDate,
  endDate: isoDate,
  reason,
}).strict().refine((v) => v.endDate >= v.startDate, { message: "endDate before startDate", path: ["endDate"] });

export const CorrectionInput = z.object({
  workDate: isoDate,
  type: z.enum(["missed_in", "missed_out", "gps_unavailable", "shift_mismatch", "other"]),
  reason,
}).strict();

export const OtInput = z.object({
  date: isoDate,
  minutes: z.number().int().min(15).max(720).refine((m) => m % 15 === 0, "multiple of 15"),
  reason,
}).strict();

export const LocaleInput = z.enum(["en", "lo"]);

export type ClockInput = z.infer<typeof ClockInput>;
export type LeaveInput = z.infer<typeof LeaveInput>;
export type CorrectionInput = z.infer<typeof CorrectionInput>;
export type OtInput = z.infer<typeof OtInput>;

export const DecisionInput = z.object({
  kind: z.enum(["leave", "ot", "correction"]),
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
}).strict().refine((v) => v.action === "approve" || (v.reason?.length ?? 0) >= 3, {
  message: "reason required to reject", path: ["reason"],
});
export type DecisionInput = z.infer<typeof DecisionInput>;
