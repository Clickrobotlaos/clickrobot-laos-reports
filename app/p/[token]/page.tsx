"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fmt } from "@/lib/util";
import { QRCodeSVG } from "qrcode.react";

type Pkg = {
  package_id: string; public_token: string;
  student_name: string; parent_name: string | null; phone: string | null;
  package: string | null; photo_url: string | null; date_of_birth: string | null;
  sessions_total: number; sessions_used: number; sessions_left: number;
  start_date: string; active: boolean;
  branch_name: string | null; program_name: string | null;
};
type Att = { id: string; date: string; status: string; notes: string | null };
type Inv = {
  id: string; invoice_no: string; date: string; due_date: string | null;
  status: string; package: string | null; sessions: number | null;
  amount: number; currency: string; amount_lak: number;
  paid_at: string | null; paid_amount: number | null; paid_currency: string | null;
  notes: string | null;
};

export default function ParentPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [att, setAtt] = useState<Att[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [company, setCompany] = useState<any>({ name: "ClickRobot Laos" });
  const [bank, setBank] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "attendance" | "invoices">("overview");

  useEffect(() => { (async () => {
    if (!token) return;
    setLoading(true);
    const [p, s] = await Promise.all([
      supabase.from("v_parent_portal").select("*").eq("public_token", token).maybeSingle(),
      supabase.from("v_public_settings").select("*"),
    ]);
    if (p.data) {
      setPkg(p.data as any);
      const [a, i] = await Promise.all([
        supabase.from("v_parent_attendance").select("*").eq("public_token", token).order("date", { ascending: false }),
        supabase.from("v_parent_invoices").select("*").eq("public_token", token).order("date", { ascending: false }),
      ]);
      setAtt((a.data as any) || []);
      setInv((i.data as any) || []);
    }
    const cSet = s.data?.find((r) => r.key === "company")?.value;
    const bSet = s.data?.find((r) => r.key === "bank")?.value;
    if (cSet) setCompany(cSet);
    if (bSet) setBank(bSet);
    setLoading(false);
  })(); }, [token]);

  if (loading) return <PortalLoading />;
  if (!pkg) return <PortalNotFound />;

  const attended = att.filter((a) => a.status === "Present").length;
  const absent = att.filter((a) => a.status === "Absent").length;
  const rate = att.length ? Math.round((attended / att.length) * 100) : 0;
  const unpaid = inv.filter((i) => i.status === "Unpaid" || i.status === "Overdue")
    .reduce((s, i) => s + (Number(i.amount_lak) || 0), 0);

  const initial = (pkg.student_name || "?").slice(0, 1).toUpperCase();
  const percentUsed = Math.min(100, Math.round((pkg.sessions_used / (pkg.sessions_total || 1)) * 100));

  return (
    <div className="pp">
      <style>{portalCss}</style>

      <div className="pp-hero">
        <div className="pp-brand">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name || "logo"} className="pp-logo-img"
                 onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="pp-logo">🤖</span>
          )}
          <span>{company.name || "ClickRobot Laos"}</span>
        </div>
        <div className="pp-title">Parent Portal</div>
      </div>

      <div className="pp-card pp-child">
        {/* QR Code — first thing parent sees */}
        <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f0f0f0" }}>
          <QRCodeSVG value={typeof window !== "undefined" ? window.location.href : ""} size={150} level="M" includeMargin
            style={{ borderRadius: 12 }} />
          <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>Show this QR to teacher for attendance</div>
        </div>
        {pkg.photo_url ? (
          <img src={pkg.photo_url} alt={pkg.student_name} className="pp-photo" />
        ) : (
          <div className="pp-photo pp-photo-fallback">{initial}</div>
        )}
        <div className="pp-child-info">
          <div className="pp-hi">Hi, {pkg.parent_name || "Parent"}! 👋</div>
          <div className="pp-childname">{pkg.student_name}</div>
          <div className="pp-childsub">
            {pkg.program_name && <span className="pp-tag pp-tag-1">{pkg.program_name}</span>}
            {pkg.branch_name && <span className="pp-tag pp-tag-2">📍 {pkg.branch_name}</span>}
            {!pkg.active && <span className="pp-tag pp-tag-off">Package finished</span>}
          </div>
        </div>
      </div>

      <div className="pp-sessions">
        <div className="pp-sess-head">
          <span className="pp-sess-title">🎯 Sessions</span>
          <span className="pp-sess-count">
            <span className="pp-sess-left">{pkg.sessions_left}</span> of {pkg.sessions_total} left
          </span>
        </div>
        <div className="pp-bar">
          <div className="pp-bar-fill" style={{ width: percentUsed + "%" }} />
        </div>
        <div className="pp-sess-msg">
          {pkg.sessions_left === 0 ? "🎉 Package complete! Contact us to renew."
            : pkg.sessions_left <= 2 ? `⚠️ Only ${pkg.sessions_left} session${pkg.sessions_left === 1 ? "" : "s"} left — time to renew!`
              : `✨ ${pkg.sessions_used} sessions completed. Keep going!`}
        </div>
      </div>

      <div className="pp-stats">
        <div className="pp-stat pp-stat-1">
          <div className="pp-stat-icon">✅</div>
          <div className="pp-stat-val">{attended}</div>
          <div className="pp-stat-lbl">Attended</div>
        </div>
        <div className="pp-stat pp-stat-2">
          <div className="pp-stat-icon">📊</div>
          <div className="pp-stat-val">{rate}%</div>
          <div className="pp-stat-lbl">Attendance</div>
        </div>
        <div className="pp-stat pp-stat-3">
          <div className="pp-stat-icon">🧾</div>
          <div className="pp-stat-val">{inv.length}</div>
          <div className="pp-stat-lbl">Invoices</div>
        </div>
        <div className={"pp-stat " + (unpaid > 0 ? "pp-stat-warn" : "pp-stat-4")}>
          <div className="pp-stat-icon">💰</div>
          <div className="pp-stat-val" style={{ fontSize: unpaid > 0 ? 18 : 22 }}>
            {unpaid > 0 ? fmt(unpaid) : "0"}
          </div>
          <div className="pp-stat-lbl">Unpaid {unpaid > 0 ? "LAK" : ""}</div>
        </div>
      </div>

      <div className="pp-tabs">
        <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>📋 Overview</button>
        <button className={tab === "attendance" ? "on" : ""} onClick={() => setTab("attendance")}>📅 Attendance</button>
        <button className={tab === "invoices" ? "on" : ""} onClick={() => setTab("invoices")}>🧾 Invoices</button>
      </div>

      {tab === "overview" && (
        <>
          <div className="pp-card">
            <h3>📚 Package details</h3>
            <div className="pp-kv">
              <div><span>Program</span><b>{pkg.program_name || "—"}</b></div>
              <div><span>Package</span><b>{pkg.package || "—"}</b></div>
              <div><span>Started</span><b>{pkg.start_date}</b></div>
              <div><span>Branch</span><b>{pkg.branch_name || "—"}</b></div>
            </div>
          </div>

          {unpaid > 0 && bank.account_no && (
            <div className="pp-card pp-pay">
              <h3>💳 How to pay</h3>
              <div className="pp-bank">
                <div><span>Bank</span><b>{bank.bank_name || "—"}</b></div>
                <div><span>Account name</span><b>{bank.account_name || "—"}</b></div>
                <div><span>Account number</span><b style={{ fontFamily: "monospace", fontSize: 15 }}>{bank.account_no}</b></div>
              </div>
              {bank.qr_url && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <img src={bank.qr_url} alt="Payment QR" style={{ maxWidth: 180, borderRadius: 12 }} />
                  <div style={{ fontSize: 13, color: "#5A6478", marginTop: 6 }}>Scan to pay</div>
                </div>
              )}
              <div className="pp-note">Please include your child&apos;s name in the transfer note. Thank you!</div>
            </div>
          )}

          <div className="pp-card">
            <h3>💬 Need help?</h3>
            <div className="pp-help">
              {company.phone && <a className="pp-btn" href={`tel:${company.phone}`}>📞 Call {company.name}</a>}
              {company.phone && <a className="pp-btn pp-btn-wa" href={`https://wa.me/${(company.phone || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">💬 WhatsApp us</a>}
            </div>
          </div>
        </>
      )}

      {tab === "attendance" && (
        <div className="pp-card">
          <h3>📅 Attendance history</h3>
          {att.length === 0 ? <div className="pp-empty">No attendance records yet.</div> :
            <div className="pp-attlist">{att.map((a) => (
              <div key={a.id} className={"pp-attitem " + (a.status === "Present" ? "ok" : "bad")}>
                <div className="pp-attdate">{new Date(a.date).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}</div>
                <div className="pp-attstatus">{a.status === "Present" ? "✓ Present" : "✗ Absent"}</div>
                {a.notes && <div className="pp-attnote">{a.notes}</div>}
              </div>
            ))}</div>
          }
        </div>
      )}

      {tab === "invoices" && (
        <div className="pp-card">
          <h3>🧾 Invoices</h3>
          {inv.length === 0 ? <div className="pp-empty">No invoices yet.</div> :
            <div className="pp-invlist">{inv.map((i) => (
              <div key={i.id} className={"pp-invitem " + (i.status === "Paid" ? "paid" : i.status === "Overdue" ? "over" : "due")}>
                <div className="pp-invtop">
                  <div>
                    <div className="pp-invno">{i.invoice_no}</div>
                    <div className="pp-invsub">{i.date}{i.package ? ` · ${i.package}` : ""}</div>
                  </div>
                  <div className="pp-invamt">
                    <div className="pp-invval">{fmt(i.amount, i.currency)} {i.currency}</div>
                    <div className={"pp-invstatus " + i.status}>{i.status}</div>
                  </div>
                </div>
                {i.paid_at && <div className="pp-invpaid">✓ Paid on {i.paid_at.slice(0, 10)}</div>}
              </div>
            ))}</div>
          }
        </div>
      )}

      <div className="pp-foot">
        Made with ❤️ by <b>{company.name || "ClickRobot Laos"}</b>
        <div className="pp-foot-note">Bookmark this page to check anytime!</div>
      </div>
    </div>
  );
}

function PortalLoading() {
  return (
    <div className="pp">
      <style>{portalCss}</style>
      <div className="pp-hero">
        <div className="pp-brand"><span className="pp-logo">🤖</span> Loading…</div>
      </div>
      <div style={{ padding: 40, textAlign: "center", color: "#5A6478" }}>Loading your child&apos;s info…</div>
    </div>
  );
}

function PortalNotFound() {
  return (
    <div className="pp">
      <style>{portalCss}</style>
      <div className="pp-hero">
        <div className="pp-brand"><span className="pp-logo">🤖</span> ClickRobot Laos</div>
        <div className="pp-title">Parent Portal</div>
      </div>
      <div className="pp-card" style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <h3>Link not found</h3>
        <p style={{ color: "#5A6478" }}>This portal link is invalid or has expired. Please contact ClickRobot Laos for a new link.</p>
      </div>
    </div>
  );
}

const portalCss = `
:root { --pink:#FF6B9D; --purple:#8B5CF6; --blue:#3B82F6; --teal:#14B8A6; --orange:#F97316; --yellow:#FBBF24; --pp-ink:#1F2937; --pp-ink2:#6B7280; --pp-line:#E5E7EB; }
* { box-sizing: border-box; }
.pp { max-width: 640px; margin: 0 auto; padding: 12px 14px 40px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--pp-ink); background: linear-gradient(180deg, #F0F9FF 0%, #F5F3FF 100%); min-height: 100vh; }
.pp h3 { margin: 0 0 12px; font-size: 16px; font-weight: 700; }

.pp-hero { text-align: center; padding: 16px 0 20px; }
.pp-brand { display: inline-flex; align-items: center; gap: 8px; background: white; padding: 8px 14px; border-radius: 999px; font-weight: 700; box-shadow: 0 2px 8px rgba(139,92,246,0.15); font-size: 14px; }
.pp-logo { font-size: 20px; }
.pp-logo-img { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; }
.pp-title { margin-top: 10px; font-size: 22px; font-weight: 800; background: linear-gradient(90deg, var(--pink), var(--purple)); -webkit-background-clip: text; background-clip: text; color: transparent; }

.pp-card { background: white; border-radius: 20px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }

.pp-child { display: flex; gap: 14px; align-items: center; background: linear-gradient(135deg, #FEF3C7 0%, #FCE7F3 100%); }
.pp-photo { width: 84px; height: 84px; border-radius: 42px; object-fit: cover; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); flex-shrink: 0; }
.pp-photo-fallback { background: linear-gradient(135deg, var(--pink), var(--purple)); color: white; display: grid; place-items: center; font-size: 34px; font-weight: 800; }
.pp-child-info { flex: 1; min-width: 0; }
.pp-hi { font-size: 13px; color: var(--pp-ink2); margin-bottom: 2px; }
.pp-childname { font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 6px; }
.pp-childsub { display: flex; gap: 6px; flex-wrap: wrap; }
.pp-tag { padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }
.pp-tag-1 { background: #DBEAFE; color: #1E40AF; }
.pp-tag-2 { background: #FCE7F3; color: #9D174D; }
.pp-tag-off { background: #E5E7EB; color: #4B5563; }

.pp-sessions { background: linear-gradient(135deg, var(--purple) 0%, var(--pink) 100%); color: white; border-radius: 20px; padding: 18px; margin-bottom: 14px; box-shadow: 0 4px 16px rgba(139,92,246,0.3); }
.pp-sess-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pp-sess-title { font-weight: 700; font-size: 14px; }
.pp-sess-count { font-size: 13px; opacity: 0.95; }
.pp-sess-left { font-size: 22px; font-weight: 800; }
.pp-bar { height: 10px; background: rgba(255,255,255,0.25); border-radius: 999px; overflow: hidden; }
.pp-bar-fill { height: 100%; background: white; border-radius: 999px; transition: width .4s ease; }
.pp-sess-msg { margin-top: 10px; font-size: 13.5px; font-weight: 500; }

.pp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.pp-stat { background: white; border-radius: 16px; padding: 12px 8px; text-align: center; }
.pp-stat-icon { font-size: 22px; }
.pp-stat-val { font-size: 22px; font-weight: 800; margin: 2px 0; }
.pp-stat-lbl { font-size: 11px; color: var(--pp-ink2); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.pp-stat-1 { background: linear-gradient(135deg, #ECFDF5, #D1FAE5); }
.pp-stat-2 { background: linear-gradient(135deg, #EFF6FF, #DBEAFE); }
.pp-stat-3 { background: linear-gradient(135deg, #FEF3C7, #FEF9C3); }
.pp-stat-4 { background: linear-gradient(135deg, #F3E8FF, #FCE7F3); }
.pp-stat-warn { background: linear-gradient(135deg, #FEE2E2, #FECACA); }
.pp-stat-warn .pp-stat-val { color: #B91C1C; }

.pp-tabs { display: flex; gap: 6px; background: white; padding: 5px; border-radius: 16px; margin-bottom: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.pp-tabs button { flex: 1; background: transparent; border: none; padding: 10px 4px; font-size: 12.5px; font-weight: 600; color: var(--pp-ink2); border-radius: 12px; cursor: pointer; }
.pp-tabs button.on { background: linear-gradient(135deg, var(--purple), var(--pink)); color: white; box-shadow: 0 2px 8px rgba(139,92,246,0.3); }

.pp-kv > div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--pp-line); font-size: 14px; }
.pp-kv > div:last-child { border-bottom: none; }
.pp-kv span { color: var(--pp-ink2); }
.pp-kv b { color: var(--pp-ink); font-weight: 700; text-align: right; }

.pp-pay { background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); }
.pp-bank > div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed rgba(0,0,0,0.1); font-size: 14px; }
.pp-bank > div:last-child { border-bottom: none; }
.pp-bank span { color: var(--pp-ink2); }
.pp-note { margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 12px; font-size: 12.5px; color: var(--pp-ink2); text-align: center; }

.pp-help { display: flex; flex-direction: column; gap: 8px; }
.pp-btn { display: block; padding: 12px 16px; background: linear-gradient(135deg, var(--blue), var(--purple)); color: white; text-decoration: none; border-radius: 14px; text-align: center; font-weight: 600; box-shadow: 0 2px 8px rgba(59,130,246,0.3); }
.pp-btn-wa { background: linear-gradient(135deg, #22C55E, #16A34A); box-shadow: 0 2px 8px rgba(34,197,94,0.3); }

.pp-empty { text-align: center; color: var(--pp-ink2); padding: 24px; font-size: 14px; }

.pp-attlist { display: flex; flex-direction: column; gap: 8px; }
.pp-attitem { padding: 12px 14px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }
.pp-attitem.ok { background: linear-gradient(135deg, #DCFCE7, #BBF7D0); }
.pp-attitem.bad { background: linear-gradient(135deg, #FEE2E2, #FECACA); }
.pp-attdate { font-weight: 600; font-size: 13.5px; }
.pp-attstatus { font-weight: 700; font-size: 13px; }
.pp-attitem.ok .pp-attstatus { color: #166534; }
.pp-attitem.bad .pp-attstatus { color: #991B1B; }
.pp-attnote { flex-basis: 100%; font-size: 12.5px; color: var(--pp-ink2); }

.pp-invlist { display: flex; flex-direction: column; gap: 10px; }
.pp-invitem { padding: 14px; border-radius: 16px; }
.pp-invitem.paid { background: linear-gradient(135deg, #DCFCE7, #BBF7D0); }
.pp-invitem.due { background: linear-gradient(135deg, #FEF3C7, #FDE68A); }
.pp-invitem.over { background: linear-gradient(135deg, #FEE2E2, #FECACA); }
.pp-invtop { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.pp-invno { font-weight: 800; font-size: 15px; }
.pp-invsub { font-size: 12.5px; color: var(--pp-ink2); margin-top: 2px; }
.pp-invamt { text-align: right; }
.pp-invval { font-weight: 800; font-size: 15px; }
.pp-invstatus { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; margin-top: 4px; text-transform: uppercase; }
.pp-invstatus.Paid { background: rgba(22,101,52,0.15); color: #166534; }
.pp-invstatus.Unpaid { background: rgba(146,64,14,0.15); color: #92400E; }
.pp-invstatus.Overdue { background: rgba(153,27,27,0.15); color: #991B1B; }
.pp-invpaid { margin-top: 8px; font-size: 12.5px; color: #166534; font-weight: 600; }

.pp-foot { text-align: center; margin-top: 20px; padding: 20px 0; font-size: 13px; color: var(--pp-ink2); }
.pp-foot b { color: var(--purple); }
.pp-foot-note { font-size: 12px; margin-top: 4px; opacity: 0.75; }

@media (max-width: 400px) {
  .pp-stats { grid-template-columns: repeat(2, 1fr); }
  .pp-child { flex-direction: column; text-align: center; }
  .pp-childsub { justify-content: center; }
}
`;
