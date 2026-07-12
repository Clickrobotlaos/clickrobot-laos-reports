"use client";
import { ReactNode, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Brand, Icon } from "./ui";
import { ROLE_LABELS, PERMS } from "@/lib/util";
import { useTheme } from "@/lib/theme";

const NAV = [
  { k: "/",           label: "Home",       icon: "home" },
  { k: "/attendance", label: "Attendance", icon: "check" },
  { k: "/scan",       label: "Quick Scan", icon: "scan" },
  { k: "/classes",    label: "Classes",    icon: "calendar" },
  { k: "/students",   label: "Students",   icon: "users" },
  { k: "/leads",      label: "Leads",      icon: "leads" },
  { k: "/reports",    label: "Reports",    icon: "report" },
  { k: "/invoices",   label: "Invoices",   icon: "invoice" },
  { k: "/records",    label: "Records",    icon: "coins" },
  { k: "/staff",      label: "Staff",      icon: "badge" },
  { k: "/payroll",    label: "Payroll",    icon: "pay" },
  { k: "/import",     label: "Import",     icon: "import" },
  { k: "/profile",    label: "My Portal",  icon: "badge" },
  { k: "/settings",   label: "Settings",   icon: "gear" },
];

export function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useTheme();
  if (app.loading) return <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>Loading…</div>;
  if (!app.userId) return null;

  const can = PERMS[app.role] || PERMS.viewer;
  const visibleNav = NAV.filter((n) => {
    if (n.k === "/settings") return can.settings;
    if (n.k === "/staff") return can.staff;
    if (n.k === "/scan") return can.attendance;
    if (n.k === "/leads") return can.attendance || can.addRecords || app.role === "admin" || app.role === "co_admin";
    if (n.k === "/classes") return app.role === "admin" || app.role === "manager";
    if (n.k === "/payroll") return can.payroll;
    if (n.k === "/import") return can.addRecords || app.role === "admin" || app.role === "co_admin";
    if (n.k === "/invoices") return can.addRecords || can.approve || app.role === "admin";
    if (n.k === "/records") return can.addRecords || can.approve || app.role === "admin";
    if (n.k === "/reports") return can.submit || can.approve || app.role === "admin";
    if (n.k === "/students") return can.attendance;
    if (n.k === "/attendance") return can.attendance;
    if (n.k === "/profile") return true;
    if (n.k === "/") return can.dashboard;
    return true;
  });

  // Mobile bottom bar: 4 most-used items + More button
  const bottomKeys = ["/", "/scan", "/attendance", "/students"];
  const bottomNav = bottomKeys
    .map((k) => visibleNav.find((n) => n.k === k))
    .filter(Boolean) as typeof NAV;

  function go(k: string) {
    setMoreOpen(false);
    router.push(k);
  }

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <Brand />
        {visibleNav.map((n) => (
          <button key={n.k} className={"nav" + (path === n.k ? " on" : "")} onClick={() => router.push(n.k)}>
            <Icon n={n.icon} />{n.label}
          </button>
        ))}
        <div className="side-credit">
          © {new Date().getFullYear()} ClickRobot Laos<br/>
          Developed by Vixaty Phompanya
        </div>
      </nav>
      <main className="main">
        <div className="topbar">
          <div className="mobilebrand"><Brand /></div>
          <div className="who">
            <span><b style={{ color: "var(--ink)" }}>{app.userName || "You"}</b> · {ROLE_LABELS[app.role] || app.role}</span>
            <button className="btn sm ghost" onClick={app.signOut}>Sign out</button>
          </div>
        </div>
        {children}
      </main>

      {/* Mobile bottom nav: 4 items + More */}
      <nav className="bottomnav" aria-label="Main">
        {bottomNav.map((n) => (
          <button key={n.k} className={path === n.k ? "on" : ""} onClick={() => go(n.k)}>
            <Icon n={n.icon} />{n.label}
          </button>
        ))}
        <button className={moreOpen ? "on" : ""} onClick={() => setMoreOpen(!moreOpen)}>
          <span style={{ fontSize: 18, lineHeight: 1, width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>☰</span>
          More
        </button>
      </nav>

      {/* Mobile More drawer */}
      {moreOpen && (
        <div className="more-overlay" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <b style={{ fontSize: 16 }}>All menu</b>
              <button className="btn sm ghost" onClick={() => setMoreOpen(false)}>✕ Close</button>
            </div>
            <div className="more-grid">
              {visibleNav.map((n) => (
                <button key={n.k} className={"more-item" + (path === n.k ? " on" : "")} onClick={() => go(n.k)}>
                  <span className="more-icon"><Icon n={n.icon} /></span>
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: "center", fontSize: 10.5, color: "var(--ink2)", opacity: 0.6 }}>
              © {new Date().getFullYear()} ClickRobot Laos · Developed by Vixaty Phompanya
            </div>
          </div>
        </div>
      )}

      <style>{`
        .side-credit { margin-top: auto; padding: 12px 16px; font-size: 10.5px; color: var(--ink2); opacity: 0.6; line-height: 1.5; border-top: 1px solid var(--line); }
        .more-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90;
          display: flex; align-items: flex-end;
        }
        .more-sheet {
          background: var(--surface); width: 100%; border-radius: 20px 20px 0 0;
          padding: 18px 16px calc(84px + env(safe-area-inset-bottom));
          max-height: 80vh; overflow-y: auto;
          animation: slideup 0.2s ease-out;
        }
        @keyframes slideup { from { transform: translateY(30%); opacity: 0.5 } to { transform: translateY(0); opacity: 1 } }
        .more-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .more-item {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 14px 6px; border: 1.5px solid var(--line); border-radius: 14px;
          background: var(--surface); font-size: 12.5px; font-weight: 500; color: var(--ink);
        }
        .more-item.on { background: var(--accent2); border-color: var(--accent); color: var(--accent); font-weight: 700; }
        .more-icon { font-size: 22px; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; }
        .more-icon svg { width: 24px; height: 24px; }
        @media (min-width: 900px) { .more-overlay { display: none } }
      `}</style>
    </div>
  );
}
