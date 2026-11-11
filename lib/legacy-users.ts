import { supabase } from "./supabase";

/**
 * Reading public.users from the legacy Records app after the 2026-11-11 production privacy change:
 * signed-in users may SELECT only directory columns, so `select("*")` is refused for everyone.
 *  1. try the old `select("*")` (works on databases without the column restriction)
 *  2. else directory columns for the list + full records via cr360_staff_confidential (proposed 0002):
 *     own record always; everyone's for the CEO or a CEO-granted payroll administrator.
 *  3. if 0002 is not applied yet, the list still shows names/roles; confidential fields stay empty.
 */
export const USER_DIRECTORY_COLS = "id,name,role,branch_id,position,photo_url,status,active,employment_type,workplace";

type Row = Record<string, unknown> & { id: string; name?: string };

export async function loadUsers(opts: { id?: string | null } = {}): Promise<{ data: Row[]; confidential: boolean }> {
  let q = supabase.from("users").select("*");
  if (opts.id) q = q.eq("id", opts.id);
  const full = await q.order("name");
  if (!full.error) return { data: (full.data ?? []) as Row[], confidential: true };

  let dq = supabase.from("users").select(USER_DIRECTORY_COLS);
  if (opts.id) dq = dq.eq("id", opts.id);
  const [dir, conf] = await Promise.all([
    dq.order("name"),
    supabase.rpc("cr360_staff_confidential", { p_user: opts.id ?? null }),
  ]);
  const byId = new Map((((conf.error ? [] : conf.data) ?? []) as Row[]).map((r) => [r.id, r]));
  const data = ((dir.data ?? []) as unknown as Row[]).map((r) => ({ ...r, ...(byId.get(r.id) ?? {}) }));
  return { data, confidential: !conf.error };
}
