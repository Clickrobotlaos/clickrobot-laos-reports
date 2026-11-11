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
  kind: z.enum(["leave", "ot", "correction", "guardian"]),
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional(),
}).strict().refine((v) => v.action === "approve" || (v.reason?.length ?? 0) >= 3, {
  message: "reason required to reject", path: ["reason"],
});
export type DecisionInput = z.infer<typeof DecisionInput>;

export const GuardianLinkInput = z.object({
  studentCode: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  relationship: z.enum(["mother", "father", "guardian", "grandparent", "other"]),
}).strict();

export const GuardianVerifyInput = z.object({
  linkId: z.string().uuid(),
  /** Must be ticked by the manager: identity confirmed in person + consent accepted. */
  confirmed: z.literal(true),
}).strict();

export const GuardianRevokeInput = z.object({
  linkId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
}).strict();

export const LeadActionInput = z.object({
  leadId: z.string().uuid(),
  action: z.enum(["contacted", "attended", "noshow", "lost", "reopen"]),
  /** Status the user saw; the update only applies if the lead is still in it. */
  expectedStatus: z.enum(["New", "Contacted", "TrialBooked", "TrialAttended", "Registered", "Lost"]),
  reason: z.string().trim().max(300).optional(),
}).strict();

export const MarkPaidInput = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(["Cash", "Bank Transfer", "QR Payment", "Other"]),
}).strict();

export const ShiftCreateInput = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  overnight: z.boolean().default(false),
}).strict();

export const ShiftCancelInput = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
}).strict();

/** Teacher roll call. The date is always "today in Vientiane" on the server — never from the client. */
export const MarkAttendanceInput = z.object({
  classId: z.string().uuid(),
  packageId: z.string().uuid(),
  status: z.enum(["Present", "Absent"]),
}).strict();

/** Parent request (migration 0009). Ownership comes from the verified link on the server, never the client. */
export const GuardianRequestInput = z.object({
  studentCode: z.string().trim().min(1).max(80),
  kind: z.enum(["absence", "makeup", "extension", "schedule", "other"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  message: z.string().trim().min(3).max(1000),
}).strict()
  .refine((v) => !["absence", "extension"].includes(v.kind) || !!v.startDate, { message: "start date required", path: ["startDate"] })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { message: "end before start", path: ["endDate"] });

export const GuardianRequestCancelInput = z.object({ id: z.string().uuid() }).strict();
