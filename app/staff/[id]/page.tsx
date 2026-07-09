"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { PERMS, ROLE_LABELS, fmt } from "@/lib/util";

export default function StaffDetailPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><StaffDetail /></Shell>;
}

function StaffDetail() {
  const app = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const can = PERMS[app.role];
  const [staff, setStaff] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = can.staff;
  const isSelf = id === app.userId;
  // DOB privacy: only admin or self can see date of birth + ID card
  const canSeePrivate = canManage || isSelf;

  useEffect(() => { (async () => {
    if (!id) return;
    setLoading(true);
    const [s, h] = await Promise.all([
      supabase.from("users").select("*").eq("id", id).maybeSingle(),
      supabase.from("salary_payroll").select("*").order("month", { ascending: false }),
    ]);
    setStaff(s.data);
    let filtered = h.data || [];
    if (s.data) {
      filtered = filtered.filter((p: any) =>
        p.user_id === s.data.id ||
        (p.user_id === null && p.staff_name?.toLowerCase().trim() === s.data.name?.toLowerCase().trim())
      );
    }
    setHistory(filtered);
    setLoading(false);
  })(); }, [id]);

  if (loading) return <div className="panel"><div className="empty">Loading…</div></div>;
  if (!staff) return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/staff")}>← Back</button>
      <div className="panel"><div className="empty">Staff not found.</div></div>
    </div>
  );

  if (!canManage && !isSelf) {
    return (
      <div>
        <button className="btn sm ghost" onClick={() => router.push("/")}>← Back</button>
        <div className="panel"><div className="empty">You can only view your own profile.</div></div>
      </div>
    );
  }

  const branchName = app.branches.find((b) => b.id === staff.branch_id)?.name || "";
  const paidCount = history.filter((p) => p.status === "Paid").length;
  const totalPaidLak = history.filter((p) => p.status === "Paid").reduce((s, p) => s + (Number(p.net_lak) || 0), 0);

  const contractEnd = staff.contract_end
    ? Math.floor((new Date(staff.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const Row = ({ label, value }: { label: string; value: any }) =>
    value ? <tr><td style={{ width: "40%", color: "var(--ink2)" }}>{label}</td><td>{value}</td></tr> : null;

  const hasAny = (fields: string[]) => fields.some((k) => staff[k]);

  return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push(canManage ? "/staff" : "/")}>← Back</button>

      <div className="panel">
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          {staff.photo_url ? (
            <img src={staff.photo_url} alt="" style={{ width: 88, height: 88, borderRadius: 44, objectFit: "cover", border: "1px solid var(--line)" }} />
          ) : (
            <div style={{ width: 88, height: 88, borderRadius: 44, background: "var(--accent2)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--font-disp)", fontSize: 34, fontWeight: 700 }}>
              {(staff.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ marginBottom: 4 }}>{staff.name}</h3>
            <div style={{ color: "var(--ink2)", fontSize: 14 }}>
              {staff.position || "—"} · {ROLE_LABELS[staff.role] || staff.role}
              {branchName && <> · {branchName}</>}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={"pill " + (staff.status === "Active" ? "Approved" : staff.status === "On leave" ? "Submitted" : "Rejected")}>{staff.status || "Active"}</span>
              {staff.employment_type && <span className="pill Draft">{staff.employment_type}</span>}
              {contractEnd !== null && contractEnd >= 0 && contractEnd <= 30 && (
                <span className="pill Submitted">Contract ends in {contractEnd} days</span>
              )}
              {contractEnd !== null && contractEnd < 0 && (
                <span className="pill Rejected">Contract expired</span>
              )}
            </div>
          </div>
          {canManage && (
            <button className="btn sm" onClick={() => router.push(`/staff?edit=${staff.id}`)}>Edit profile</button>
          )}
        </div>
      </div>

      <div className="grid2">
        {/* Contact */}
        <div className="panel">
          <h3>Contact</h3>
          <table className="tbl" style={{ width: "100%" }}><tbody>
            <Row label="Email" value={staff.email} />
            <Row label="Phone" value={staff.phone} />
            <Row label="Address" value={staff.address} />
            <Row label="Permanent address" value={staff.permanent_address} />
            <Row label="City / Province" value={[staff.city, staff.province].filter(Boolean).join(", ")} />
            <Row label="Emergency contact" value={staff.emergency_contact} />
          </tbody></table>
        </div>

        {/* Personal identity (with privacy) */}
        {(hasAny(["nationality","gender","marital_status"]) || canSeePrivate) && (
          <div className="panel">
            <h3>Personal</h3>
            <table className="tbl" style={{ width: "100%" }}><tbody>
              {canSeePrivate && staff.date_of_birth && <Row label="Date of birth 🔒" value={staff.date_of_birth} />}
              <Row label="Nationality" value={staff.nationality} />
              <Row label="Gender" value={staff.gender} />
              <Row label="Marital status" value={staff.marital_status} />
              {canSeePrivate && <Row label="ID / Passport 🔒" value={staff.id_card} />}
            </tbody></table>
            {!canSeePrivate && staff.date_of_birth && (
              <div className="hint" style={{ marginTop: 8 }}>🔒 Some fields (DOB, ID) are private and only visible to admin or the staff themselves.</div>
            )}
          </div>
        )}

        {/* Education */}
        {hasAny(["degree","field_of_study","university","graduation_year"]) && (
          <div className="panel">
            <h3>Education</h3>
            <table className="tbl" style={{ width: "100%" }}><tbody>
              <Row label="Degree" value={staff.degree} />
              <Row label="Field of study" value={staff.field_of_study} />
              <Row label="University / school" value={staff.university} />
              <Row label="Graduation year" value={staff.graduation_year} />
            </tbody></table>
          </div>
        )}

        {/* Employment */}
        {hasAny(["workplace","employment_type","work_schedule","start_date","end_date"]) && (
          <div className="panel">
            <h3>Employment</h3>
            <table className="tbl" style={{ width: "100%" }}><tbody>
              <Row label="Workplace" value={staff.workplace} />
              <Row label="Employment type" value={staff.employment_type} />
              <Row label="Schedule" value={staff.work_schedule} />
              <Row label="Start date" value={staff.start_date} />
              <Row label="End date" value={staff.end_date} />
            </tbody></table>
          </div>
        )}

        {/* Contract */}
        {hasAny(["contract_type","contract_start","contract_end","contract_url"]) && (
          <div className="panel">
            <h3>Contract</h3>
            <table className="tbl" style={{ width: "100%" }}><tbody>
              <Row label="Type" value={staff.contract_type} />
              <Row label="Start" value={staff.contract_start} />
              <Row label="End" value={staff.contract_end} />
              {staff.contract_url && (
                <tr><td style={{ color: "var(--ink2)" }}>Document</td>
                  <td><a href={staff.contract_url} target="_blank" rel="noreferrer">View contract</a></td></tr>
              )}
            </tbody></table>
          </div>
        )}

        {/* Salary defaults — admin/self only for privacy; also hide CEO's salary from co_admin */}
        {canSeePrivate && (isSelf || staff.role !== "admin" || can.ceoSalary) && (
          <div className="panel">
            <h3>Salary defaults</h3>
            <table className="tbl" style={{ width: "100%" }}><tbody>
              <Row label="Base salary" value={staff.base_salary ? `${fmt(staff.base_salary, staff.salary_currency)} ${staff.salary_currency}` : null} />
              <Row label="Bank" value={staff.bank_name} />
              <Row label="Account" value={staff.bank_account_no} />
            </tbody></table>
          </div>
        )}
      </div>

      {staff.notes && (
        <div className="panel">
          <h3>Notes</h3>
          <div style={{ whiteSpace: "pre-wrap" }}>{staff.notes}</div>
        </div>
      )}

      {/* Salary history — admin/self only; hide CEO's from co_admin */}
      {canSeePrivate && (isSelf || staff.role !== "admin" || can.ceoSalary) && (
        <div className="panel">
          <h3>Salary history</h3>
          <div className="cards" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
            <div className="card"><div className="lbl">Payslips</div><div className="val">{history.length}</div></div>
            <div className="card ok"><div className="lbl">Paid</div><div className="val">{paidCount}</div></div>
            <div className="card"><div className="lbl">Total paid</div><div className="val" style={{ fontSize: 18 }}>{fmt(totalPaidLak)} LAK</div></div>
          </div>
          {history.length === 0 ? <div className="empty">No salary records yet.</div> : (
            <div className="tblwrap">
              <table className="tbl">
                <thead><tr><th>Month</th><th>Pay date</th><th style={{ textAlign: "right" }}>Net</th><th style={{ textAlign: "right" }}>Net LAK</th><th>Status</th></tr></thead>
                <tbody>{history.map((p) => (
                  <tr key={p.id}>
                    <td>{p.month}</td>
                    <td>{p.pay_date || "—"}</td>
                    <td className="num">{fmt(p.net, p.currency)} {p.currency}</td>
                    <td className="num">{fmt(p.net_lak)}</td>
                    <td><span className={"pill " + p.status}>{p.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
