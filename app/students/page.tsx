"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { csvDownload } from "@/lib/util";

export default function StudentsPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><StudentsView /></Shell>;
}

function StudentsView() {
  const app = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [program, setProgram] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "finished">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("student_packages")
        .select("*").order("student_name");
      setRows((data || []).map((r: any) => ({ ...r, sessions_left: Math.max(0, r.sessions_total - r.sessions_used) })));
      setLoading(false);
    })();
  }, []);

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";
  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "";

  const visible = rows.filter((r) => {
    if (branch && r.branch_id !== branch) return false;
    if (program && r.program_id !== program) return false;
    if (filter === "low" && !(r.active && r.sessions_left > 0 && r.sessions_left <= 2)) return false;
    if (filter === "finished" && r.active) return false;
    if (filter === "all" && !r.active) return false;  // "all active" by default
    if (!q) return true;
    const s = q.toLowerCase();
    return (`${r.student_name} ${r.parent_name || ""} ${r.phone || ""}`).toLowerCase().includes(s);
  });

  const lowCount = rows.filter((r) => r.active && r.sessions_left > 0 && r.sessions_left <= 2).length;
  const finishedCount = rows.filter((r) => !r.active).length;
  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div>
      <div className="sectionhead">
        <h2>Students</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => csvDownload("students.csv", visible)} disabled={!visible.length}>Export CSV</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Active ({activeCount})</button>
        <button className={filter === "low" ? "on" : ""} onClick={() => setFilter("low")}>Low balance ({lowCount})</button>
        <button className={filter === "finished" ? "on" : ""} onClick={() => setFilter("finished")}>Finished ({finishedCount})</button>
      </div>

      <div className="frow c3" style={{ marginBottom: 12 }}>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All branches</option>
          {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={program} onChange={(e) => setProgram(e.target.value)}>
          <option value="">All programs</option>
          {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {filter === "low" && lowCount > 0 && (
        <div className="banner warn">
          These students have 2 or fewer sessions left. Consider calling their parents for a package renewal.
        </div>
      )}

      {loading ? <div className="panel"><div className="empty">Loading…</div></div>
        : visible.length === 0 ? (
          <div className="panel">
            <div className="empty">
              {filter === "low" ? "No students with low balance right now." :
                filter === "finished" ? "No finished packages yet." :
                  "No active student packages yet. Create an invoice with sessions and mark it Paid to add one."}
            </div>
          </div>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr>
                <th>Student</th><th>Parent</th><th>Phone</th><th>Program</th>
                <th>Branch</th><th style={{ textAlign: "right" }}>Sessions</th>
                <th>Status</th><th></th>
              </tr></thead>
              <tbody>{visible.map((r) => {
                const low = r.sessions_left > 0 && r.sessions_left <= 2;
                const done = r.sessions_left === 0 || !r.active;
                return (
                  <tr key={r.id}>
                    <td><b>{r.student_name}</b></td>
                    <td>{r.parent_name || "—"}</td>
                    <td>{r.phone || "—"}</td>
                    <td>{programName(r.program_id)}</td>
                    <td>{branchName(r.branch_id)}</td>
                    <td className="num">{r.sessions_used}/{r.sessions_total}</td>
                    <td>
                      {done ? <span className="pill Rejected">Finished</span>
                        : low ? <span className="pill Submitted">Low ({r.sessions_left})</span>
                          : <span className="pill Approved">{r.sessions_left} left</span>}
                    </td>
                    <td><button className="btn sm ghost" onClick={() => router.push(`/students/${r.id}`)}>Open</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
    </div>
  );
}
