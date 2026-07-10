"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel } from "@/components/ui";
import { PERMS } from "@/lib/util";
import * as XLSX from "xlsx";

// Package size → sessions mapping
const PKG_SESSIONS: Record<string, number> = { S: 16, M: 32, L: 48, TRIAL: 4, CAMP: 8 };

// Try to extract program name and package size from class string like "Spike Prime_S"
function parseClass(cls: string): { program: string; size: string } {
  const s = (cls || "").trim();
  // Check for known suffixes
  const suffixMatch = s.match(/[_\s](S|M|L)$/i);
  if (suffixMatch) {
    const size = suffixMatch[1].toUpperCase();
    const program = s.slice(0, suffixMatch.index!).replace(/_$/, "").trim();
    return { program, size };
  }
  // Check for special packages
  const lower = s.toLowerCase();
  if (lower.includes("camp")) return { program: s, size: "CAMP" };
  if (lower.includes("4 session")) return { program: s.replace(/[_\s]*4\s*sessions?/i, "").trim(), size: "TRIAL" };
  return { program: s, size: "SPECIAL" };
}

type Row = {
  sr: number;
  id: string;
  student_name: string;
  parent_name: string;
  class_raw: string;
  program_parsed: string;
  size_parsed: string;
  discount: number;
  admission_date: string;
  date_of_birth: string;
  gender: string;
  status: string;
  sessions: number;
  bonus: number;
  selected: boolean;
  error: string;
};

export default function ImportPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  const can = PERMS[app.role] || PERMS.viewer;
  if (!can.addRecords && app.role !== "admin" && app.role !== "co_admin") {
    return <Shell><div className="panel"><div className="empty">Only CEO/Manager can import students.</div></div></Shell>;
  }
  return <Shell><ImportView /></Shell>;
}

function ImportView() {
  const app = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState({ success: 0, failed: 0, errors: [] as string[] });
  const [defaultBranch, setDefaultBranch] = useState(app.branches[0]?.id || "");
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");

  function parseExcel(f: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: "" });

      // Find header row (look for "Student Name" or "Sr")
      let headerIdx = 0;
      for (let i = 0; i < Math.min(json.length, 5); i++) {
        const row = json[i] as any[];
        if (row.some((c: any) => String(c).toLowerCase().includes("student name"))) {
          headerIdx = i;
          break;
        }
      }

      const headers = (json[headerIdx] as any[]).map((h: any) => String(h).trim().toLowerCase());
      const colMap = {
        sr: headers.findIndex((h) => h === "sr" || h === "#" || h === "no"),
        id: headers.findIndex((h) => h === "id" || h === "student id"),
        name: headers.findIndex((h) => h.includes("student name") || h === "name"),
        parent: headers.findIndex((h) => h.includes("father") || h.includes("parent") || h.includes("guardian")),
        class: headers.findIndex((h) => h === "class" || h.includes("program") || h.includes("package")),
        discount: headers.findIndex((h) => h.includes("discount")),
        admission: headers.findIndex((h) => h.includes("admission") || h.includes("registration") || h.includes("enroll")),
        dob: headers.findIndex((h) => h.includes("birth") || h === "dob"),
        gender: headers.findIndex((h) => h.includes("gender") || h === "sex"),
        status: headers.findIndex((h) => h === "status"),
      };

      const parsed: Row[] = [];
      for (let i = headerIdx + 1; i < json.length; i++) {
        const r = json[i] as any[];
        if (!r || r.length === 0) continue;
        const name = String(r[colMap.name] || "").trim();
        if (!name) continue;

        const classRaw = String(r[colMap.class] || "").trim();
        const { program, size } = parseClass(classRaw);
        const discount = colMap.discount >= 0 ? Number(r[colMap.discount]) || 0 : 0;
        const sessions = PKG_SESSIONS[size] || 0;

        // Parse dates
        let admission = "";
        let dob = "";
        if (colMap.admission >= 0 && r[colMap.admission]) {
          admission = formatDate(r[colMap.admission]);
        }
        if (colMap.dob >= 0 && r[colMap.dob]) {
          dob = formatDate(r[colMap.dob]);
        }

        const status = colMap.status >= 0 ? String(r[colMap.status]).trim() : "Active";
        const gender = colMap.gender >= 0 ? String(r[colMap.gender]).trim().toLowerCase() : "";

        parsed.push({
          sr: parsed.length + 1,
          id: colMap.id >= 0 ? String(r[colMap.id]).trim() : "",
          student_name: name,
          parent_name: colMap.parent >= 0 ? String(r[colMap.parent]).trim() : "",
          class_raw: classRaw,
          program_parsed: program,
          size_parsed: size,
          discount: Math.round(discount * 100), // convert 0.1 → 10
          admission_date: admission,
          date_of_birth: dob,
          gender,
          status: status === "Inactive" ? "Inactive" : status === "Passive" ? "Passive" : "Active",
          sessions,
          bonus: 0,
          selected: true,
          error: "",
        });
      }
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsArrayBuffer(f);
  }

  function formatDate(v: any): string {
    if (!v) return "";
    if (v instanceof Date) {
      const y = v.getFullYear();
      if (y < 1900 || y > 2100) return "";
      return v.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    // Try DD-MM-YYYY
    const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) {
      const [, d, mo, yr] = m;
      return `${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return "";
  }

  function toggleAll(sel: boolean) {
    setRows(rows.map((r) => ({ ...r, selected: sel })));
  }
  function toggleRow(idx: number) {
    setRows(rows.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  }
  function updateRow(idx: number, field: string, value: any) {
    setRows(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  async function doImport() {
    setImporting(true);
    const selected = rows.filter((r) => r.selected);
    let success = 0, failed = 0;
    const errors: string[] = [];

    // Get programs for matching
    const { data: progs } = await supabase.from("programs").select("id,name");
    const progMap = new Map((progs || []).map((p: any) => [p.name.toLowerCase().replace(/\s+/g, " ").trim(), p.id]));

    for (const r of selected) {
      try {
        // Match program
        const progKey = r.program_parsed.toLowerCase().replace(/\s+/g, " ").trim();
        let programId: string | null = null;
        for (const [k, v] of progMap) {
          if (progKey.includes(k) || k.includes(progKey)) {
            programId = v as string;
            break;
          }
        }
        // Fuzzy match: try first word
        if (!programId) {
          const firstWord = progKey.split(/[\s_]/)[0];
          for (const [k, v] of progMap) {
            if (k.includes(firstWord)) { programId = v as string; break; }
          }
        }

        const totalSessions = (r.sessions || 16) + (r.bonus || 0);

        const payload: any = {
          student_id: r.id || null,
          student_name: r.student_name,
          parent_name: r.parent_name || null,
          package: r.class_raw || null,
          package_size: r.size_parsed || null,
          program_id: programId,
          branch_id: defaultBranch || null,
          base_sessions: r.sessions || 16,
          bonus_sessions: r.bonus || 0,
          sessions_total: totalSessions,
          sessions_used: 0,
          discount_percent: r.discount || 0,
          date_of_birth: r.date_of_birth || null,
          gender: r.gender || null,
          admission_date: r.admission_date || null,
          start_date: r.admission_date || null,
          student_status: r.status || "Active",
          active: r.status !== "Inactive",
        };

        const { error } = await supabase.from("student_packages").insert(payload);
        if (error) {
          failed++;
          errors.push(`${r.student_name}: ${error.message}`);
        } else {
          success++;
        }
      } catch (e: any) {
        failed++;
        errors.push(`${r.student_name}: ${e.message}`);
      }
    }
    setResult({ success, failed, errors });
    setImporting(false);
    setStep("done");
  }

  // UPLOAD STEP
  if (step === "upload") {
    return (
      <div>
        <div className="sectionhead"><h2>Import Students from Excel</h2></div>
        <div className="panel">
          <p style={{ color: "var(--ink2)", marginBottom: 16 }}>
            Upload an Excel file (.xlsx) with student data. The importer will auto-detect columns
            and let you preview before importing.
          </p>
          <p style={{ color: "var(--ink2)", fontSize: 13, marginBottom: 16 }}>
            <b>Supported formats:</b> eSkooly exports, or any Excel with columns like
            &quot;Student Name&quot;, &quot;Class&quot;, &quot;Status&quot;, &quot;Date Of Birth&quot;, etc.
          </p>

          <Field label="Default branch for imported students">
            <select value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)}>
              {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>

          <div style={{
            border: "2px dashed var(--line)", borderRadius: 16, padding: 40,
            textAlign: "center", marginTop: 16, cursor: "pointer",
            background: file ? "#F0FFF4" : "#FAFBFD",
          }}
            onClick={() => document.getElementById("xlsxInput")?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation();
              const f = e.dataTransfer.files[0];
              if (f) { setFile(f); parseExcel(f); }
            }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {file ? `✅ ${file.name}` : "Click or drag an Excel file here"}
            </div>
            <div style={{ color: "var(--ink2)", fontSize: 13, marginTop: 6 }}>
              .xlsx files only
            </div>
            <input id="xlsxInput" type="file" accept=".xlsx,.xls" hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFile(f); parseExcel(f); }
              }} />
          </div>
        </div>
      </div>
    );
  }

  // DONE STEP
  if (step === "done") {
    return (
      <div>
        <div className="sectionhead"><h2>Import Complete</h2></div>
        <div className="panel">
          <div className="cards" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 16 }}>
            <div className="card ok"><div className="lbl">Imported</div><div className="val">{result.success}</div></div>
            <div className={"card" + (result.failed > 0 ? " bad" : "")}><div className="lbl">Failed</div><div className="val">{result.failed}</div></div>
            <div className="card"><div className="lbl">Total</div><div className="val">{result.success + result.failed}</div></div>
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3>Errors:</h3>
              {result.errors.map((e, i) => (
                <div key={i} className="banner bad" style={{ marginBottom: 4, fontSize: 13 }}>{e}</div>
              ))}
            </div>
          )}
          <div className="btnrow">
            <button className="btn" onClick={() => { setStep("upload"); setFile(null); setRows([]); setDone(false); }}>Import another file</button>
            <button className="btn ghost" onClick={() => window.location.href = "/students"}>Go to Students</button>
          </div>
        </div>
      </div>
    );
  }

  // PREVIEW STEP
  const selectedCount = rows.filter((r) => r.selected).length;
  const statCounts = { Active: 0, Passive: 0, Inactive: 0 };
  rows.filter((r) => r.selected).forEach((r) => {
    if (r.status in statCounts) statCounts[r.status as keyof typeof statCounts]++;
  });

  return (
    <div>
      <div className="sectionhead">
        <h2>Preview — {rows.length} students found</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => { setStep("upload"); setFile(null); setRows([]); }}>← Back</button>
          <button className="btn sm" disabled={importing || selectedCount === 0} onClick={doImport}>
            {importing ? "Importing…" : `Import ${selectedCount} students`}
          </button>
        </div>
      </div>

      <div className="cards" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 12 }}>
        <div className="card"><div className="lbl">Total found</div><div className="val">{rows.length}</div></div>
        <div className="card ok"><div className="lbl">Active</div><div className="val">{statCounts.Active}</div></div>
        <div className="card"><div className="lbl">Passive</div><div className="val">{statCounts.Passive}</div></div>
        <div className="card bad"><div className="lbl">Inactive</div><div className="val">{statCounts.Inactive}</div></div>
      </div>

      <div className="panel" style={{ marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={selectedCount === rows.length}
              onChange={(e) => toggleAll(e.target.checked)} /> Select all
          </label>
          <span style={{ color: "var(--ink2)", fontSize: 13 }}>{selectedCount} of {rows.length} selected</span>
          <Field label="Default branch">
            <select value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} style={{ minWidth: 150 }}>
              {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="tblwrap">
        <table className="tbl" style={{ fontSize: 13 }}>
          <thead><tr>
            <th style={{ width: 30 }}></th>
            <th>#</th>
            <th>ID</th>
            <th>Student Name</th>
            <th>Parent</th>
            <th>Class (raw)</th>
            <th>Program</th>
            <th>Size</th>
            <th style={{ textAlign: "right" }}>Sessions</th>
            <th style={{ textAlign: "right" }}>Discount</th>
            <th>DOB</th>
            <th>Gender</th>
            <th>Status</th>
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} style={{ opacity: r.selected ? 1 : 0.4 }}>
              <td><input type="checkbox" checked={r.selected} onChange={() => toggleRow(i)} /></td>
              <td>{r.sr}</td>
              <td style={{ fontSize: 12, fontFamily: "monospace" }}>{r.id || "—"}</td>
              <td><b>{r.student_name}</b></td>
              <td>{r.parent_name || "—"}</td>
              <td style={{ fontSize: 12, color: "var(--ink2)" }}>{r.class_raw}</td>
              <td>{r.program_parsed}</td>
              <td>
                <select value={r.size_parsed} onChange={(e) => {
                  const sz = e.target.value;
                  updateRow(i, "size_parsed", sz);
                  updateRow(i, "sessions", PKG_SESSIONS[sz] || r.sessions);
                }} style={{ fontSize: 12, padding: "2px 4px" }}>
                  <option value="TRIAL">Trial (4)</option>
                  <option value="S">S (16)</option>
                  <option value="M">M (32)</option>
                  <option value="L">L (48)</option>
                  <option value="CAMP">Camp (8)</option>
                  <option value="SPECIAL">Special</option>
                </select>
              </td>
              <td className="num">{r.sessions}</td>
              <td className="num">{r.discount > 0 ? `${r.discount}%` : "—"}</td>
              <td style={{ fontSize: 12 }}>{r.date_of_birth || "—"}</td>
              <td>{r.gender || "—"}</td>
              <td>
                <select value={r.status} onChange={(e) => updateRow(i, "status", e.target.value)}
                  style={{ fontSize: 12, padding: "2px 4px" }}>
                  <option value="Active">Active</option>
                  <option value="Passive">Passive</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
