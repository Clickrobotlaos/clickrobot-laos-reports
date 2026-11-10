import "./cr360.css";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Shell360, type NavItem } from "@/components/cr360/Shell360";
import { loadViewer } from "@/lib/cr360/viewer";
import { workspacesFor } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";

export const metadata = { title: "ClickRobot 360" };

export default async function Cr360Layout({ children }: { children: ReactNode }) {
  const ctx = await loadViewer();
  if (!ctx.viewer && !ctx.signedInWithoutMembership) redirect("/login");
  const t = dict(ctx.locale);
  const nav: NavItem[] = [{ href: "/360", label: t.home }];
  for (const w of workspacesFor(ctx.viewer)) nav.push({ href: `/360/${w}`, label: t[`ws_${w}`] });
  return (
    <Shell360
      nav={nav}
      locale={ctx.locale}
      who={ctx.displayName}
      labels={{ app: t.app, tagline: t.tagline, language: t.language, signOut: t.signOut, legacy: t.legacy }}
    >
      {children}
    </Shell360>
  );
}
