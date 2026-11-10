import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Per-request Supabase client acting AS THE SIGNED-IN USER (publishable/anon key + session cookie).
 * All reads/writes are therefore subject to RLS. There is deliberately NO service-role client in
 * this codebase; privileged operations go through audited SECURITY DEFINER RPCs with auth checks.
 */
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing (see .env.example)");
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; refresh happens in route handlers.
        }
      },
    },
  });
}
