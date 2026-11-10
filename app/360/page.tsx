import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { workspacesFor } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";

export default async function Cr360Home() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer) {
    return (
      <div className="cr-card" role="status">
        <h1 className="cr-h1">{t.noMembership}</h1>
        <p className="cr-muted">{t.noMembershipHint}</p>
        <Link className="cr-btn ghost" href="/">{t.legacy}</Link>
      </div>
    );
  }
  const ws = workspacesFor(ctx.viewer);
  return (
    <>
      <h1 className="cr-h1">{t.app}</h1>
      <p className="cr-sub">{t.tagline}</p>
      <div className="cr-grid c3">
        {ws.map((w) => (
          <Link key={w} href={`/360/${w}`} className="cr-card" style={{ textDecoration: "none", color: "inherit" }}>
            <h2>{t[`ws_${w}`]} →</h2>
          </Link>
        ))}
      </div>
    </>
  );
}
