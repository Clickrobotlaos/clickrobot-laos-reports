import "server-only";
import { hasRole } from "./access";
import { loadViewer } from "./viewer";
import { jsonError, sameOrigin } from "./api";

/** Consent text version that managers confirm. Unset = parent verification disabled (deliberate gate). */
export function guardianConsentVersion(): string | null {
  const v = process.env.CR360_GUARDIAN_CONSENT_VERSION?.trim();
  return v && /^[A-Za-z0-9._-]{3,40}$/.test(v) ? v : null;
}

/** CEO or branch manager only; the DB functions re-check branch ownership of the student. */
export async function requireGuardianAdmin(req: Request) {
  if (!sameOrigin(req)) return { ok: false as const, res: jsonError(403, "bad_origin") };
  const ctx = await loadViewer();
  if (!ctx.viewer) return { ok: false as const, res: jsonError(401, "unauthenticated") };
  if (!hasRole(ctx.viewer, ["ceo", "manager"])) return { ok: false as const, res: jsonError(403, "forbidden") };
  return { ok: true as const, ctx };
}
