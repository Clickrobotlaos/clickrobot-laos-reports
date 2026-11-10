import { describe, expect, it } from "vitest";
import { fetchAllPages } from "@/lib/cr360/paging";

function fakeTable(n: number, maxRows = 1000) {
  const all = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const make = (from: number, to: number) => {
    calls.push([from, to]);
    // emulate Supabase: never more than maxRows per response
    return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + maxRows)), error: null });
  };
  return { make, calls };
}

describe("fetchAllPages (Supabase 1000-row cap)", () => {
  it("returns every row across pages", async () => {
    const t = fakeTable(2500);
    const r = await fetchAllPages(t.make);
    expect(r.rows).toHaveLength(2500);
    expect(r.truncated).toBe(false);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("exact multiple of page size needs one extra empty page, then stops", async () => {
    const t = fakeTable(2000);
    const r = await fetchAllPages(t.make);
    expect(r.rows).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
  });
  it("reports truncation at the cap instead of a silently short total", async () => {
    const r = await fetchAllPages(fakeTable(5000).make, { cap: 3000 });
    expect(r.rows).toHaveLength(3000);
    expect(r.truncated).toBe(true);
  });
  it("surfaces errors", async () => {
    const r = await fetchAllPages(() => Promise.resolve({ data: null, error: { message: "x" } }));
    expect(r.error).toBe(true);
  });
});
