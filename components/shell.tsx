"use client";
import { ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Brand, Icon } from "./ui";
import { ROLE_LABELS, PERMS } from "@/lib/util";

const NAV = [
  { k: "/",           label: "Home",       icon: "home" },
  { k: "/attendance", label: "Attendance", icon: "check" },
  { k: "/classes",    label: "Classes",    icon: "calendar" },
  { k: "/students",   label: "Students",   icon: "users" },
  { k: "/reports",    label: "Reports",    icon: "report" },
  { k: "/invoices",   label: "Invoices",   icon: "invoice" },
  { k: "/records",    label: "Records",    icon: "coins" },
  { k: "/staff",      label: "Staff",      icon: "badge" },
  { k: "/payroll",    label: "Payroll",    icon: "pay" },
  { k: "/profile",    label: "My profile", icon: "badge" },
  { k: "/settings",   label: "Settings",   icon: "gear" },
];

export function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const path = usePathname();
  if (app.loading) return <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>Loading…</div>;
  if (!app.userId) return null;

  const can = PERMS[app.role] || PERMS.viewer;
  const visibleNav = NAV.filter((n) => {
    if (n.k === "/settings") return can.settings;
    if (n.k === "/staff") return can.staff;
    if (n.k === "/classes") return app.role === "admin" || app.role === "manager";
    if (n.k === "/payroll") return can.payroll;
    if (n.k === "/invoices") return can.addRecords || can.approve || app.role === "admin";
    if (n.k === "/records") return can.addRecords || can.approve || app.role === "admin";
    if (n.k === "/reports") return can.submit || can.approve || app.role === "admin";
    if (n.k === "/students") return can.attendance;
    if (n.k === "/attendance") return can.attendance;
    if (n.k === "/profile") return app.role === "staff";
    if (n.k === "/") return can.dashboard;
    return true;
  });

  const bottomKeys = new Set(["/", "/attendance", "/classes", "/students", "/settings", "/profile"]);
  const bottomNav = visibleNav.filter((n) => bottomKeys.has(n.k)).slice(0, 5);

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <Brand />
        {visibleNav.map((n) => (
          <button key={n.k} className={"nav" + (path === n.k ? " on" : "")} onClick={() => router.push(n.k)}>
            <Icon n={n.icon} />{n.label}
          </button>
        ))}
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
      <nav className="bottomnav" aria-label="Main">
        {bottomNav.map((n) => (
          <button key={n.k} className={path === n.k ? "on" : ""} onClick={() => router.push(n.k)}>
            <Icon n={n.icon} />{n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
