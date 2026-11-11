import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { hasRole } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { HrAdmin, type HrPerson } from "@/components/cr360/HrAdmin";

export const dynamic = "force-dynamic";

/** CEO only: payroll access grants (0002) and suspend / reinstate / offboard (0012). The database re-checks. */
export default async function HrPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !hasRole(ctx.viewer, ["ceo"])) return <Unauthorized t={t} />;
  const sb = await supabaseServer();
  const [users, grants] = await Promise.all([
    sb.from("users").select("id,name,role,status").order("name").limit(500),   // directory columns only
    sb.rpc("cr360_payroll_grants"),
  ]);
  const active = new Set(((grants.error ? [] : grants.data ?? []) as { user_id: string; revoked_at: string | null }[]).filter((g) => !g.revoked_at).map((g) => g.user_id));
  const people: HrPerson[] = ((users.data ?? []) as { id: string; name: string; role: string; status: string | null }[]).map((u) => ({
    id: u.id, name: u.name, role: u.role, status: u.status ?? "Active", payrollGrant: active.has(u.id), isSelf: u.id === ctx.viewer!.userId,
  }));
  return (
    <>
      <Link href="/360" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>{t.peopleAccess}</h1>
      <p className="cr-sub">{t.peopleAccessNote}</p>
      {grants.error && <div className="cr-banner info">{t.hrNotEnabled}</div>}
      <section className="cr-card"><HrAdmin people={people} t={t} /></section>
    </>
  );
}
