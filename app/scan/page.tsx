"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { PERMS, todayStr } from "@/lib/util";

type FoundStudent = {
  id: string;
  student_id: string;
  student_name: string;
  parent_name: string;
  phone: string;
  photo_url: string;
  program_id: string;
  branch_id: string;
  sessions_total: number;
  sessions_used: number;
  student_status: string;
  active: boolean;
};

export default function ScanPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><ScanView /></Shell>;
}

function ScanView() {
  const app = useApp();
  const [mode, setMode] = useState<"search" | "scan">("search");
  const [searchId, setSearchId] = useState("");
  const [student, setStudent] = useState<FoundStudent | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [marked, setMarked] = useState<"" | "Present" | "Absent">("");
  const [marking, setMarking] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "";
  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";

  // Search student by ID
  async function searchStudent(id: string) {
    const trimmed = id.trim();
    setSearchId(trimmed);
    setStudent(null);
    setNotFound(false);
    setMarked("");
    setTodayAttendance(null);
    if (!trimmed) return;

    setSearching(true);
    const { data } = await supabase.from("student_packages")
      .select("id,student_id,student_name,parent_name,phone,photo_url,program_id,branch_id,sessions_total,sessions_used,student_status,active")
      .eq("student_id", trimmed).maybeSingle();

    if (data) {
      setStudent(data);
      // Check if already marked today
      const { data: att } = await supabase.from("attendance")
        .select("id,status").eq("package_id", data.id).eq("date", todayStr()).maybeSingle();
      if (att) {
        setTodayAttendance(att);
        setMarked(att.status);
      }
    } else {
      setNotFound(true);
    }
    setSearching(false);
  }

  // Handle QR scan result
  function onScanResult(decodedText: string) {
    // QR encodes the parent portal URL like /p/[token]
    // Extract token and find student
    stopScanner();
    const match = decodedText.match(/\/p\/([a-f0-9-]+)/i);
    if (match) {
      findByToken(match[1]);
    } else {
      // Maybe it's just a student ID
      searchStudent(decodedText);
    }
  }

  async function findByToken(token: string) {
    setSearching(true);
    setStudent(null);
    setNotFound(false);
    setMarked("");
    setTodayAttendance(null);
    const { data } = await supabase.from("student_packages")
      .select("id,student_id,student_name,parent_name,phone,photo_url,program_id,branch_id,sessions_total,sessions_used,student_status,active")
      .eq("public_token", token).maybeSingle();
    if (data) {
      setStudent(data);
      setSearchId(data.student_id || "");
      const { data: att } = await supabase.from("attendance")
        .select("id,status").eq("package_id", data.id).eq("date", todayStr()).maybeSingle();
      if (att) { setTodayAttendance(att); setMarked(att.status); }
    } else {
      setNotFound(true);
    }
    setSearching(false);
  }

  // Start QR scanner
  async function startScanner() {
    setScannerActive(true);
    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => onScanResult(text),
        () => {} // ignore errors
      );
    } catch (err) {
      console.error("Camera error:", err);
      setScannerActive(false);
      alert("Camera not available. Please use manual search instead.");
    }
  }

  function stopScanner() {
    if (scannerRef.current) {
      try { scannerRef.current.stop(); } catch (e) {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  }

  // Clean up scanner on unmount
  useEffect(() => { return () => { stopScanner(); }; }, []);

  // Mark attendance
  async function markAttendance(status: "Present" | "Absent") {
    if (!student) return;
    setMarking(true);
    if (todayAttendance) {
      // Update existing
      await supabase.from("attendance").update({ status, recorded_by: app.userId }).eq("id", todayAttendance.id);
    } else {
      // Insert new
      await supabase.from("attendance").insert({
        package_id: student.id, date: todayStr(), status, recorded_by: app.userId,
      });
    }
    setMarked(status);
    setMarking(false);

    // Auto-clear after 3 seconds for next student
    setTimeout(() => {
      setStudent(null);
      setSearchId("");
      setMarked("");
      setTodayAttendance(null);
      setNotFound(false);
    }, 3000);
  }

  // Reset for next student
  function reset() {
    setStudent(null);
    setSearchId("");
    setMarked("");
    setTodayAttendance(null);
    setNotFound(false);
  }

  const left = student ? Math.max(0, student.sessions_total - student.sessions_used) : 0;

  return (
    <div>
      <div className="sectionhead">
        <h2>📷 Quick Attendance</h2>
        <div style={{ fontSize: 13, color: "var(--ink2)" }}>{todayStr()}</div>
      </div>

      {/* Mode toggle */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={mode === "search" ? "on" : ""} onClick={() => { setMode("search"); stopScanner(); }}>
          🔍 Search by ID
        </button>
        <button className={mode === "scan" ? "on" : ""} onClick={() => { setMode("scan"); if (!scannerActive) startScanner(); }}>
          📷 Scan QR Code
        </button>
      </div>

      {/* Search mode */}
      {mode === "search" && !student && !marked && (
        <div className="panel" style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <h3>Enter Student ID</h3>
          <div style={{ maxWidth: 300, margin: "0 auto" }}>
            <input
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") searchStudent(searchId); }}
              placeholder="Type student ID and press Enter"
              style={{ fontSize: 20, textAlign: "center", padding: "12px 16px" }}
              autoFocus
            />
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => searchStudent(searchId)} disabled={!searchId.trim() || searching}>
            {searching ? "Searching…" : "Search"}
          </button>
          {notFound && (
            <div style={{ marginTop: 12, color: "#DC2626", fontWeight: 600 }}>
              ❌ No student found with ID &quot;{searchId}&quot;
            </div>
          )}
        </div>
      )}

      {/* Scan mode */}
      {mode === "scan" && !student && !marked && (
        <div className="panel" style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <h3>Scan Student QR Code</h3>
          <p style={{ color: "var(--ink2)", fontSize: 13, marginBottom: 16 }}>
            Point camera at the student&apos;s QR code (from their phone or printed card)
          </p>
          <div id="qr-reader" style={{
            width: "100%", maxWidth: 400, margin: "0 auto", borderRadius: 12, overflow: "hidden",
          }} />
          {!scannerActive && (
            <button className="btn" style={{ marginTop: 12 }} onClick={startScanner}>
              Start Camera
            </button>
          )}
          {scannerActive && (
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={stopScanner}>
              Stop Camera
            </button>
          )}
          {searching && <div style={{ marginTop: 12, color: "var(--ink2)" }}>Looking up student…</div>}
          {notFound && (
            <div style={{ marginTop: 12, color: "#DC2626", fontWeight: 600 }}>
              ❌ QR code not recognized. Try manual search.
            </div>
          )}
        </div>
      )}

      {/* Student found — show big attendance buttons */}
      {student && !marked && (
        <div className="panel" style={{ textAlign: "center", padding: 24 }}>
          {/* Student card */}
          <div style={{ marginBottom: 20 }}>
            {student.photo_url ? (
              <img src={student.photo_url} alt="" style={{ width: 80, height: 80, borderRadius: 40, objectFit: "cover", border: "2px solid var(--line)", margin: "0 auto 10px" }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 40, background: "var(--accent2)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: 32, fontWeight: 700, margin: "0 auto 10px" }}>
                {(student.student_name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <h2 style={{ marginBottom: 4 }}>{student.student_name}</h2>
            <div style={{ color: "var(--ink2)", fontSize: 14 }}>
              ID: {student.student_id || "—"} · {programName(student.program_id)} · {branchName(student.branch_id)}
            </div>
            {student.parent_name && (
              <div style={{ color: "var(--ink2)", fontSize: 13, marginTop: 4 }}>
                Parent: {student.parent_name}{student.phone ? ` · ${student.phone}` : ""}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <span className={"pill " + (left === 0 ? "Rejected" : left <= 2 ? "Submitted" : "Approved")} style={{ fontSize: 14, padding: "6px 14px" }}>
                {student.sessions_used}/{student.sessions_total} sessions used · {left} remaining
              </span>
            </div>
          </div>

          {/* Big attendance buttons */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => markAttendance("Present")}
              disabled={marking}
              style={{
                width: 160, height: 160, borderRadius: 20, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "white",
                fontSize: 20, fontWeight: 700, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 4px 20px rgba(34,197,94,0.3)", transition: "transform 0.1s",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              <span style={{ fontSize: 48 }}>✓</span>
              Present
            </button>

            <button
              onClick={() => markAttendance("Absent")}
              disabled={marking}
              style={{
                width: 160, height: 160, borderRadius: 20, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #EF4444, #DC2626)", color: "white",
                fontSize: 20, fontWeight: 700, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 4px 20px rgba(239,68,68,0.3)", transition: "transform 0.1s",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              <span style={{ fontSize: 48 }}>✗</span>
              Absent
            </button>
          </div>

          <button className="btn sm ghost" style={{ marginTop: 16 }} onClick={reset}>← Back to search</button>
        </div>
      )}

      {/* Marked confirmation */}
      {marked && student && (
        <div className="panel" style={{
          textAlign: "center", padding: 30,
          background: marked === "Present" ? "linear-gradient(135deg, #F0FDF4, #DCFCE7)" : "linear-gradient(135deg, #FEF2F2, #FEE2E2)",
          border: `2px solid ${marked === "Present" ? "#86EFAC" : "#FCA5A5"}`,
        }}>
          <div style={{ fontSize: 64 }}>{marked === "Present" ? "✅" : "❌"}</div>
          <h2 style={{ marginTop: 8, color: marked === "Present" ? "#16A34A" : "#DC2626" }}>
            {student.student_name}
          </h2>
          <div style={{ fontSize: 18, fontWeight: 600, color: marked === "Present" ? "#16A34A" : "#DC2626" }}>
            Marked {marked}
          </div>
          <div style={{ color: "var(--ink2)", fontSize: 13, marginTop: 8 }}>
            Auto-clearing in 3 seconds…
          </div>
          <button className="btn sm ghost" style={{ marginTop: 12 }} onClick={reset}>
            Next student →
          </button>
        </div>
      )}
    </div>
  );
}
