/** Pure KPI aggregation over legacy Records rows (testable, no I/O). */
export const LEAD_CLOSED = ["Registered", "Lost"];
export const INVOICE_UNPAID = ["Draft", "Sent"];
export const LOW_SESSION_THRESHOLD = 2;

interface In {
  branches: { id: string; name: string; active: boolean | null }[];
  packages: { id: string; branch_id: string | null; sessions_total: number | null; sessions_used: number | null; active: boolean | null }[];
  attendanceToday: { id: string; status: string | null }[];
  leads: { id: string; branch_id: string | null; status: string | null }[];
  invoices: { id: string; branch_id: string | null; status: string | null }[];
}

export function remaining(p: { sessions_total: number | null; sessions_used: number | null }) {
  return (p.sessions_total ?? 0) - (p.sessions_used ?? 0);
}

export function computeCeoKpis(i: In) {
  const active = i.packages.filter((p) => p.active);
  const low = active.filter((p) => remaining(p) <= LOW_SESSION_THRESHOLD);
  const openLeads = i.leads.filter((l) => !LEAD_CLOSED.includes(l.status ?? ""));
  const unpaid = i.invoices.filter((v) => INVOICE_UNPAID.includes(v.status ?? ""));
  const names = new Map(i.branches.map((b) => [b.id, b.name]));
  const keys = new Set<string>([...i.branches.map((b) => b.id)]);
  for (const r of [...active, ...openLeads, ...unpaid]) keys.add(r.branch_id ?? "unassigned");
  const byBranch = [...keys].map((id) => ({
    branch: names.get(id) ?? (id === "unassigned" ? "Unassigned" : "Unknown branch"),
    active: active.filter((p) => (p.branch_id ?? "unassigned") === id).length,
    low: low.filter((p) => (p.branch_id ?? "unassigned") === id).length,
    leads: openLeads.filter((l) => (l.branch_id ?? "unassigned") === id).length,
    unpaid: unpaid.filter((v) => (v.branch_id ?? "unassigned") === id).length,
  })).filter((r) => r.active + r.low + r.leads + r.unpaid > 0 || names.has(r.branch));
  return {
    activePackages: active.length,
    lowSessions: low.length,
    presentToday: i.attendanceToday.filter((a) => a.status === "Present").length,
    openLeads: openLeads.length,
    unpaidInvoices: unpaid.length,
    byBranch,
  };
}
