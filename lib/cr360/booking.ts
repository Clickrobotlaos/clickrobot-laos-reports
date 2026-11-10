/**
 * Seat booking + teacher overlap rules (pure model).
 * Production: enforced inside one serialised DB transaction (advisory lock per class session)
 * — see supabase/proposed/0003_session_ledger.sql. Never rely on the client.
 */
export interface Booking {
  id: string;
  classSessionId: string;
  studentId: string;
  status: "confirmed" | "cancelled";
}

export type BookResult =
  | { ok: true; booking: Booking }
  | { ok: false; code: "duplicate" | "full" | "invalid_capacity" };

export function bookSeat(
  existing: Booking[],
  req: { id: string; classSessionId: string; studentId: string; capacity: number },
): BookResult {
  if (!Number.isInteger(req.capacity) || req.capacity <= 0) return { ok: false, code: "invalid_capacity" };
  const live = existing.filter((b) => b.classSessionId === req.classSessionId && b.status === "confirmed");
  if (live.some((b) => b.studentId === req.studentId)) return { ok: false, code: "duplicate" };
  if (live.length >= req.capacity) return { ok: false, code: "full" };
  return { ok: true, booking: { id: req.id, classSessionId: req.classSessionId, studentId: req.studentId, status: "confirmed" } };
}

export interface TeachingSlot { teacherId: string; startsAt: string; endsAt: string; branchId: string; sessionId: string }

/** Half-open intervals [start, end). Applies across ALL branches and partner schools. */
export function findTeacherConflict(slots: TeachingSlot[], candidate: TeachingSlot): TeachingSlot | null {
  const s = Date.parse(candidate.startsAt), e = Date.parse(candidate.endsAt);
  if (!(e > s)) throw new Error("Invalid slot");
  return (
    slots.find(
      (x) => x.teacherId === candidate.teacherId && x.sessionId !== candidate.sessionId &&
        Date.parse(x.startsAt) < e && s < Date.parse(x.endsAt),
    ) ?? null
  );
}
