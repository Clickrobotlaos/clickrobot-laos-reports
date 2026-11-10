import { describe, expect, it } from "vitest";
import { GuardianLinkInput, GuardianRevokeInput, GuardianVerifyInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";

const id = "60000000-0000-4000-8000-0000000000a2";

describe("guardian admin contracts", () => {
  it("link: normalises e-mail, requires a known relationship, rejects extra fields", () => {
    const r = GuardianLinkInput.safeParse({ studentCode: "TST-001", email: "  Parent@Example.COM ", relationship: "mother" });
    expect(r.success && r.data.email).toBe("parent@example.com");
    expect(GuardianLinkInput.safeParse({ studentCode: "TST-001", email: "not-an-email", relationship: "mother" }).success).toBe(false);
    expect(GuardianLinkInput.safeParse({ studentCode: "TST-001", email: "a@b.co", relationship: "uncle" }).success).toBe(false);
    expect(GuardianLinkInput.safeParse({ studentCode: "TST-001", email: "a@b.co", relationship: "other", guardianUserId: "x" }).success).toBe(false);
  });
  it("verify: requires explicit confirmation and NEVER accepts a client consent version", () => {
    expect(GuardianVerifyInput.safeParse({ linkId: id, confirmed: true }).success).toBe(true);
    expect(GuardianVerifyInput.safeParse({ linkId: id, confirmed: false }).success).toBe(false);
    expect(GuardianVerifyInput.safeParse({ linkId: id, confirmed: true, consentVersion: "fake" }).success).toBe(false);
  });
  it("revoke: reason required", () => {
    expect(GuardianRevokeInput.safeParse({ linkId: id, reason: "no" }).success).toBe(false);
    expect(GuardianRevokeInput.safeParse({ linkId: id, reason: "parent request" }).success).toBe(true);
  });
});

describe("rpc error mapping (SQLSTATEs verified in tests/db)", () => {
  it.each([
    [{ code: "PGRST202" }, "not_enabled", 501],
    [{ code: "23505" }, "duplicate", 409],
    [{ code: "P0002" }, "not_found", 404],
    [{ code: "42501" }, "forbidden", 403],
    [{ code: "22023" }, "validation", 400],
    [{ code: "40001" }, "already_decided", 409],
    [{ code: "XX000" }, "server_error", 500],
  ])("%o → %s", (err, code, status) => {
    expect(rpcErrorCode(err)).toEqual({ code, status });
  });
});
