"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Locale } from "@/lib/cr360/i18n";

export interface NavItem { href: string; label: string }

/** Presentational shell. Nav items are computed on the server from DB memberships; hiding a link is UX only. */
export function Shell360(props: {
  nav: NavItem[];
  locale: Locale;
  labels: { app: string; tagline: string; language: string; signOut: string; legacy: string };
  who: string | null;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setLocale(l: Locale) {
    if (l === props.locale || busy) return;
    setBusy(true);
    await fetch("/api/cr360/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: l }) });
    setBusy(false);
    router.refresh();
  }

  async function signOut() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await sb.auth.signOut();
    router.replace("/login");
  }

  const current = (href: string) => (href === "/360" ? path === "/360" : path.startsWith(href)) ? "page" : undefined;
  const brand = (
    <div className="cr-brand"><b>ClickRobot <span>360</span></b><small>{props.labels.tagline}</small></div>
  );

  return (
    <div className="cr360" lang={props.locale}>
      <div className="cr-shell">
        <nav className="cr-rail cr-nav" aria-label="Workspaces">
          {brand}
          {props.nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current(n.href)}><span className="dot" aria-hidden="true" />{n.label}</Link>
          ))}
          <div style={{ marginTop: "auto" }}>
            <Link href="/" className="cr-muted" style={{ padding: "0 14px" }}>{props.labels.legacy} ↗</Link>
          </div>
        </nav>
        <main className="cr-main" id="main">
          <header className="cr-top">
            {brand}
            <div className="cr-top-right">
              {props.who && <span className="cr-who">{props.who}</span>}
              <div className="cr-seg" role="group" aria-label={props.labels.language}>
                <button type="button" aria-pressed={props.locale === "en"} onClick={() => setLocale("en")} lang="en">EN</button>
                <button type="button" aria-pressed={props.locale === "lo"} onClick={() => setLocale("lo")} lang="lo">ລາວ</button>
              </div>
              <button type="button" className="cr-btn ghost" onClick={signOut}>{props.labels.signOut}</button>
            </div>
          </header>
          {props.children}
        </main>
      </div>
      <nav className="cr-bottom cr-nav" aria-label="Workspaces">
        {props.nav.map((n) => (
          <Link key={n.href} href={n.href} aria-current={current(n.href)}>{n.label}</Link>
        ))}
      </nav>
    </div>
  );
}
