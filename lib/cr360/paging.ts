/**
 * Fetch every row of a PostgREST query in pages. Supabase caps responses at its "max rows" setting
 * (1000 by default) regardless of .limit(), which would silently truncate totals. `make(from, to)` must
 * build the query with a STABLE order (e.g. .order("id")) and apply .range(from, to).
 * Stops at `cap` rows and reports truncated=true so callers can show a warning instead of a wrong total.
 */
export async function fetchAllPages<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opts: { pageSize?: number; cap?: number } = {},
): Promise<{ rows: T[]; error: boolean; truncated: boolean }> {
  const size = opts.pageSize ?? 1000;
  const cap = opts.cap ?? 50000;
  const rows: T[] = [];
  for (let from = 0; from < cap; from += size) {
    const { data, error } = await make(from, Math.min(from + size, cap) - 1);
    if (error) return { rows, error: true, truncated: false };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < Math.min(size, cap - from)) return { rows, error: false, truncated: false };
  }
  return { rows, error: false, truncated: true };
}
