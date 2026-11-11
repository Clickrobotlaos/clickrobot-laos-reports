import { describe, expect, it } from "vitest";
import { addDays, shiftRange, vientianeToIso } from "@/lib/cr360/shifts";
import { ShiftCancelInput, ShiftCreateInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";

describe("Vientiane wall-clock → UTC", () => {
  it("converts with the fixed +07:00 offset", () => {
    expect(vientianeToIso("2026-11-12", "08:30")).toBe("2026-11-12T01:30:00.000Z");
    expect(vientianeToIso("2026-11-12", "06:00")).toBe("2026-11-11T23:00:00.000Z"); // previous UTC day
  });
  it("rejects impossible dates and times", () => {
    expect(() => vientianeToIso("2026-02-30", "08:00")).toThrow();
    expect(() => vientianeToIso("2026-11-12", "24:00")).toThrow();
    expect(() => vientianeToIso("12/11/2026", "08:00")).toThrow();
  });
  it("adds days across month/year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("shift ranges", () => {
  it("same-day shift", () => {
    expect(shiftRange({ date: "2026-11-12", start: "08:00", end: "17:00", overnight: false }))
      .toEqual({ startsAt: "2026-11-12T01:00:00.000Z", endsAt: "2026-11-12T10:00:00.000Z" });
  });
  it("overnight shift must be explicit", () => {
    expect(() => shiftRange({ date: "2026-11-12", start: "22:00", end: "06:00", overnight: false })).toThrow();
    expect(shiftRange({ date: "2026-11-12", start: "22:00", end: "06:00", overnight: true }).endsAt).toBe("2026-11-12T23:00:00.000Z");
  });
  it("zero-length shift rejected", () => {
    expect(() => shiftRange({ date: "2026-11-12", start: "08:00", end: "08:00", overnight: false })).toThrow();
  });
});

describe("shift contracts", () => {
  const employeeId = "20000000-0000-4000-8000-0000000000a2";
  it("create: strict fields, overnight defaults to false", () => {
    const r = ShiftCreateInput.safeParse({ employeeId, date: "2026-11-12", start: "08:00", end: "12:00" });
    expect(r.success && r.data.overnight).toBe(false);
    expect(ShiftCreateInput.safeParse({ employeeId, date: "2026-11-12", start: "8:00", end: "12:00" }).success).toBe(false);
    expect(ShiftCreateInput.safeParse({ employeeId, date: "2026-11-12", start: "08:00", end: "12:00", branchId: "x" }).success).toBe(false);
  });
  it("cancel requires a reason", () => {
    expect(ShiftCancelInput.safeParse({ shiftId: employeeId, reason: "x" }).success).toBe(false);
    expect(ShiftCancelInput.safeParse({ shiftId: employeeId, reason: "staff swap" }).success).toBe(true);
  });
  it("overlap error maps to 409", () => {
    expect(rpcErrorCode({ code: "23P01" })).toEqual({ code: "overlap", status: 409 });
  });
});
