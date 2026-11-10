import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace, studentBranchScope } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { summariseStudents, matchesSearch } from "@/lib/cr360/students";
import { loadAttendanceFor, loadNames, loadScopedPackages } from "@/lib/cr360/legacy-students";
import { Unauthorized } from "@/components/cr360/Blocks";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "low", "mismatch", "inactive"] as const;
type Filter = (typeof FILTERS)[number];

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "students")) return <Unauthorized t={t} />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const f: Filter = (FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as Filter) : "all";

  const scope = studentBranchScope(ctx.viewer);
  const sb = await supabaseServer();
  const [{ packages, error: e1, truncated }, names] = await Promise.all([loadScopedPackages(sb, scope), loadNames(sb)]);
  const { rows: att, error: e2 } = await loadAttendanceFor(sb, packages.map((p) => p.id));
  const all = summariseStudents(packages, att);
  const counts = { low: all.filter((s) => s.low).length, mismatch: all.filter((s) => s.mismatch).length };
  const list = all.filter((s) => matchesSearch(s, q)).filter((s) =>
    f === "low" ? s.low : f === "mismatch" ? s.mismatch : f === "inactive" ? s.activePackages === 0 : true);

  const label: Record<Filter, string> = { all: t.filterAll, low: `${t.filterLow} (${counts.low})`, mismatch: `${t.filterMismatch} (${counts.mismatch})`, inactive: t.filterInactive };
  const href = (nf: Filter) => `/360/students?${new URLSearchParams({ ...(q ? { q } : {}), ...(nf !== "all" ? { f: nf } : {}) })}`;

  return (
    <>
      <h1 className="cr-h1">{t.ws_students}</h1>
      <p className="cr-sub">{t.studentsSub} {scope === null ? t.scopeAll : t.scopeBranch}</p>
      <div className="cr-banner info">{t.legacyReadNote}</div>
      {(e1 || e2 || truncated) && <div className="cr-banner bad">{t.err_server_error}</div>}

      <section className="cr-card">
        <form method="get" action="/360/students" className="cr-form" role="search" style={{ marginBottom: 12 }}>
          <div className="cr-field">
            <label htmlFor="q">{t.search}</label>
            <input id="q" name="q" type="search" defaultValue={q} maxLength={60} autoComplete="off" />
          </div>
          {f !== "all" && <input type="hidden" name="f" value={f} />}
        </form>
        <nav className="cr-tabs" aria-label="Filter">
          {FILTERS.map((k) => (
            <Link key={k} href={href(k)} aria-current={f === k ? "page" : undefined} className="cr-badge"
              style={{ padding: "8px 14px", textDecoration: "none", ...(f === k ? { background: "var(--c-ink)", color: "var(--c-surface)" } : {}) }}>
              {label[k]}
            </Link>
          ))}
        </nav>

        {list.length === 0 ? <p className="cr-muted">{t.noStudents}</p> : (
          <div className="cr-tablewrap">
            <table className="cr-table">
              <caption className="cr-sr">{t.ws_students}</caption>
              <thead><tr>
                <th scope="col">{t.colStudent}</th><th scope="col">{t.colCode}</th><th scope="col">{t.colBranch}</th>
                <th scope="col">{t.colPackages}</th><th scope="col">{t.colRemaining}</th><th scope="col">{t.status}</th>
              </tr></thead>
              <tbody>{list.map((s) => (
                <tr key={s.code}>
                  <td><Link href={`/360/students/${encodeURIComponent(s.code)}`}>{s.name}</Link></td>
                  <td className="cr-muted">{s.code.startsWith("pkg:") ? "—" : s.code}</td>
                  <td>{s.branchIds.map((b) => names.branch.get(b) ?? "—").join(", ") || "—"}</td>
                  <td>{s.activePackages}/{s.packages}</td>
                  <td><b>{s.activePackages ? s.remaining : "—"}</b></td>
                  <td>
                    {s.low && <span className="cr-badge pending">{t.lowBalance}</span>}{" "}
                    {s.mismatch && <span className="cr-badge rejected">{t.mismatch}</span>}{" "}
                    {!s.low && !s.mismatch && <span className="cr-badge">{s.status}</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="cr-muted">{t.total}: {list.length} / {all.length}</p>
      </section>
    </>
  );
}
