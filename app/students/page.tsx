"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { csvDownload, PERMS } from "@/lib/util";

export default function StudentsPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><StudentsView /></Shell>;
}

function StudentsView() {
  const app = useApp();
  const router = useRouter();
  const isAdmin = app.role === "admin";
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [program, setProgram] = useState("");
  const [filter, setFilter] = useState<"all" | "passive" | "low" | "finished">("all");
  const [sortBy, setSortBy] = useState<"id" | "name" | "newest">("id");
  const [pendingDeletes, setPendingDeletes] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const [students, delReqs] = await Promise.all([
      supabase.from("student_packages").select("*").order("created_at", { ascending: false }),
      isAdmin ? supabase.from("deletion_requests").select("*").eq("status", "Pending").order("created_at") : Promise.resolve({ data: [] }),
    ]);
    setRows((students.data || []).map((r: any) => ({ ...r, sessions_left: Math.max(0, r.sessions_total - r.sessions_used) })));
    setPendingDeletes(delReqs.data || []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";
  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "";

  const visible = rows.filter((r) => {
    if (branch && r.branch_id !== branch) return false;
    if (program && r.program_id !== program) return false;
    const status = r.student_status || (r.active ? "Active" : "Inactive");
    if (filter === "low" && !(status === "Active" && r.sessions_left > 0 && r.sessions_left <= 2)) return false;
    if (filter === "finished" && status !== "Inactive") return false;
    if (filter === "passive" && status !== "Passive") return false;
    if (filter === "all" && status !== "Active") return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (`${r.student_name} ${r.parent_name || ""} ${r.phone || ""} ${r.student_id || ""}`).toLowerCase().includes(s);
  }).sort((a, b) => {
    if (sortBy === "id") {
      const aId = parseInt(a.student_id || "999999");
      const bId = parseInt(b.student_id || "999999");
      return aId - bId;
    }
    if (sortBy === "name") return (a.student_name || "").localeCompare(b.student_name || "");
    if (sortBy === "newest") return (b.created_at || "").localeCompare(a.created_at || "");
    return 0;
  });

  const lowCount = rows.filter((r) => (r.student_status || (r.active ? "Active" : "Inactive")) === "Active" && r.sessions_left > 0 && r.sessions_left <= 2).length;
  const finishedCount = rows.filter((r) => (r.student_status || (r.active ? "Active" : "Inactive")) === "Inactive").length;
  const passiveCount = rows.filter((r) => r.student_status === "Passive").length;
  const activeCount = rows.filter((r) => (r.student_status || (r.active ? "Active" : "Inactive")) === "Active").length;

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
        <button className={filter === "passive" ? "on" : ""} onClick={() => setFilter("passive")}>Passive ({passiveCount})</button>
        <button className={filter === "low" ? "on" : ""} onClick={() => setFilter("low")}>Low balance ({lowCount})</button>
        <button className={filter === "finished" ? "on" : ""} onClick={() => setFilter("finished")}>Inactive ({finishedCount})</button>
      </div>

      {/* CEO: Pending deletion requests */}
      {isAdmin && pendingDeletes.length > 0 && (
        <div className="panel" style={{ borderColor: "#FCA5A5", borderWidth: 2, background: "#FFF5F5", marginBottom: 12 }}>
          <h3 style={{ color: "#B91C1C", marginBottom: 10 }}>🗑️ Pending deletion requests ({pendingDeletes.length})</h3>
          {pendingDeletes.map((req) => (
            <div key={req.id} style={{
              padding: 12, background: "white", borderRadius: 10, marginBottom: 8,
              border: "1px solid #FECACA", display: "flex", justifyContent: "space-between",
              alignItems: "center", flexWrap: "wrap", gap: 8,
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{req.student_name}</div>
                <div style={{ color: "var(--ink2)", fontSize: 13 }}>
                  Requested by {req.requested_by_name || "staff"} · {new Date(req.created_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Reason: {req.reason}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm bad" disabled={processingId === req.id}
                  onClick={async () => {
                    if (!confirm(`Delete ${req.student_name} permanently? This cannot be undone.`)) return;
                    setProcessingId(req.id);
                    await supabase.from("attendance").delete().eq("package_id", req.student_id);
                    await supabase.from("class_bookings").delete().eq("package_id", req.student_id);
                    await supabase.from("student_packages").delete().eq("id", req.student_id);
                    await supabase.from("deletion_requests").update({ status: "Approved", reviewed_by: app.userId, reviewed_at: new Date().toISOString() }).eq("id", req.id);
                    setProcessingId(null);
                    reload();
                  }}>
                  ✓ Approve & Delete
                </button>
                <button className="btn sm ghost" disabled={processingId === req.id}
                  onClick={async () => {
                    setProcessingId(req.id);
                    await supabase.from("deletion_requests").update({ status: "Rejected", reviewed_by: app.userId, reviewed_at: new Date().toISOString() }).eq("id", req.id);
                    setProcessingId(null);
                    reload();
                  }}>
                  ✗ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="frow c3" style={{ marginBottom: 12 }}>
        <input placeholder="Search by name, ID, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All branches</option>
          {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={program} onChange={(e) => setProgram(e.target.value)}>
          <option value="">All programs</option>
          {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--ink2)" }}>Sort by:</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ fontSize: 13, padding: "4px 8px" }}>
          <option value="id">Student ID (1, 2, 3…)</option>
          <option value="name">Name (A → Z)</option>
          <option value="newest">Newest first</option>
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
                <th>ID</th><th>Student</th><th>Parent</th><th>Phone</th><th>Program</th>
                <th>Branch</th><th style={{ textAlign: "right" }}>Sessions</th>
                <th>Status</th><th></th>
              </tr></thead>
              <tbody>{visible.map((r) => {
                const low = r.sessions_left > 0 && r.sessions_left <= 2;
                const status = r.student_status || (r.active ? "Active" : "Inactive");
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, fontFamily: "monospace", color: "var(--ink2)" }}>{r.student_id || "—"}</td>
                    <td><b>{r.student_name}</b></td>
                    <td>{r.parent_name || "—"}</td>
                    <td>{r.phone || "—"}</td>
                    <td>{programName(r.program_id)}</td>
                    <td>{branchName(r.branch_id)}</td>
                    <td className="num">{r.sessions_used}/{r.sessions_total}</td>
                    <td>
                      {status === "Inactive" ? <span className="pill Rejected">Inactive</span>
                        : status === "Passive" ? <span className="pill Draft">Passive</span>
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
