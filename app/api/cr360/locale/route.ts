import { cookies } from "next/headers";
import { LocaleInput } from "@/lib/cr360/schemas";
import { LOCALE_COOKIE } from "@/lib/cr360/i18n";
import { jsonError, jsonOk, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/locale { locale: "en" | "lo" } — preference cookie only (not personal data). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const body = await req.json().catch(() => null);
  const r = LocaleInput.safeParse(body?.locale);
  if (!r.success) return jsonError(400, "validation");
  (await cookies()).set(LOCALE_COOKIE, r.data, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return jsonOk({ locale: r.data });
}
