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

// ---- Lesson logs & parent reports (migration 0010) ----
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = (max: number) => z.string().trim().max(max).optional();
const RubricInput = z.record(z.enum(["problem_solving", "programming", "mechanics", "teamwork"]), z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]));

export const LessonLogInput = z.object({
  classId: z.string().uuid(),
  date: isoDay,
  unit: optText(200),
  lessonTitle: z.string().trim().min(2).max(200),
  level: optText(100),
  covered: optText(4000),
  nextPlan: optText(4000),
  substituteNotes: optText(4000),
}).strict();

export const StudentNoteInput = z.object({
  logId: z.string().uuid(),
  packageId: z.string().uuid(),
  rubric: RubricInput,
  teacherNote: optText(2000),
  reportEn: optText(3000),
  reportLo: optText(3000),
  source: z.enum(["teacher", "ai_draft", "ai_draft_edited", "template"]),
}).strict();

export const NoteApproveInput = z.object({ noteId: z.string().uuid() }).strict();

export const DraftReportsInput = z.object({
  classId: z.string().uuid(),
  date: isoDay,
  mode: z.enum(["ai", "template"]),
  lesson: z.object({
    unit: optText(200), lessonTitle: z.string().trim().min(2).max(200), level: optText(100), covered: optText(4000), nextPlan: optText(4000),
  }).strict(),
  students: z.array(z.object({ packageId: z.string().uuid(), rubric: RubricInput, teacherNote: optText(2000) }).strict()).min(1).max(40),
}).strict();

/** Manager assigns / revokes a substitute teacher for one class (0010 cr360_class_substitutes). */
export const SubstituteInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    classId: z.string().uuid(),
    userId: z.string().uuid(),
    startsOn: isoDay,
    endsOn: isoDay,
    reason: z.string().trim().min(3).max(300),
  }).strict(),
  z.object({ action: z.literal("revoke"), id: z.string().uuid(), reason: z.string().trim().max(300).optional() }).strict(),
]).superRefine((v, ctx) => {
  if (v.action === "assign" && v.endsOn < v.startsOn) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "end before start", path: ["endsOn"] });
});

/** Guardian changes an OPTIONAL consent for one verified child (0013). Required consent is not toggled here. */
export const CONSENT_PURPOSES = ["portal_media", "ai_reports", "notifications", "public_marketing"] as const;
export const GuardianConsentInput = z.object({
  studentCode: z.string().trim().min(1).max(80),
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.boolean(),
}).strict();

/** Achievements & certificates (0015): teacher proposes; branch manager / CEO issues, declines or revokes. */
export const AchievementInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("propose"),
    packageId: z.string().uuid(),
    kind: z.enum(["badge", "level_complete", "competition", "certificate"]),
    titleEn: z.string().trim().min(2).max(160),
    titleLo: optText(160),
    level: optText(100),
    awardedOn: isoDay,
    note: optText(500),
  }).strict(),
  z.object({ action: z.enum(["issue", "decline", "revoke"]), id: z.string().uuid(), reason: optText(300) }).strict(),
]);

/** Class media (0016): register an uploaded file, or share / unshare / remove it. */
export const MediaInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|mp4)$/i),
    kind: z.enum(["photo", "video"]),
    mime: z.enum(["image/jpeg", "video/mp4"]),
    bytes: z.number().int().positive().max(52428800),
    durationS: z.number().positive().max(60).optional(),
    caption: optText(300),
    tagged: z.array(z.string().uuid()).max(30),
  }).strict(),
  z.object({ action: z.enum(["share", "unshare", "remove"]), id: z.string().uuid(), reason: optText(300) }).strict(),
]);

/** In-app announcements (0017). branchId null = all branches (CEO only; enforced in the database). */
export const AnnouncementInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid().optional(),
    branchId: z.string().uuid().nullable(),
    audience: z.enum(["parents", "staff", "all"]),
    titleEn: z.string().trim().min(2).max(140), titleLo: optText(140),
    bodyEn: z.string().trim().min(2).max(2000), bodyLo: optText(2000),
    showFrom: isoDay, showUntil: isoDay,
    publish: z.boolean().optional(),
  }).strict(),
  z.object({ action: z.enum(["publish", "withdraw"]), id: z.string().uuid() }).strict(),
]);
