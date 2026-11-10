"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BranchRow { branch: string; active: number; low: number; leads: number; unpaid: number }

/** Interactive comparison; the table beside it is the accessible fallback. */
export function BranchChart({ rows, labels }: { rows: BranchRow[]; labels: { active: string; low: string; leads: string } }) {
  if (rows.length === 0) return <p className="cr-muted">—</p>;
  return (
    <div style={{ width: "100%", height: 260 }} aria-hidden="true">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--c-line)" />
          <XAxis dataKey="branch" tick={{ fill: "var(--c-ink2)", fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--c-ink2)", fontSize: 12 }} />
          <Tooltip contentStyle={{ background: "var(--c-surface)", border: "1px solid var(--c-line)", borderRadius: 10 }} />
          <Legend />
          <Bar dataKey="active" name={labels.active} fill="#1463ff" radius={[6, 6, 0, 0]} />
          <Bar dataKey="low" name={labels.low} fill="#0aa5a5" radius={[6, 6, 0, 0]} />
          <Bar dataKey="leads" name={labels.leads} fill="#8fd400" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
