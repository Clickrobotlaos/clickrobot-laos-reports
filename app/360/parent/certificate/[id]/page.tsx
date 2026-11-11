import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { PrintButton } from "@/components/cr360/PrintButton";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Printable certificate for a verified parent. Data comes only from cr360_guardian_achievements (0015). */
export default async function CertificatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ child?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !canUseWorkspace(ctx.viewer, "parent")) return <Unauthorized t={t} />;
  const { id } = await params;
  const child = (await searchParams).child ?? "";
  if (!UUID.test(id) || !child || child.length > 80) return <Unauthorized t={t} />;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_guardian_achievements", { p_student_code: child });
  const a = (error ? [] : (data ?? []) as { id: string; title_en: string; title_lo: string | null; level: string | null; awarded_on: string; certificate_no: string | null; student_name: string; branch_name: string | null }[])
    .find((r) => r.id === id);
  if (!a) return <Unauthorized t={t} />;
  return (
    <>
      <div className="cr-noprint" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <Link href={`/360/parent?child=${encodeURIComponent(child)}`} className="cr-muted">← {t.back}</Link>
        <PrintButton label={t.certPrint} />
      </div>
      <article className="cr-cert" aria-label={t.certTitle}>
        <p className="cr-cert-brand">ClickRobot</p>
        <h1>{t.certTitle}</h1>
        <p>{t.certPresented}</p>
        <p className="cr-cert-name">{a.student_name}</p>
        <p>{t.certFor}</p>
        <p className="cr-cert-title">{a.title_en}{a.title_lo ? <><br />{a.title_lo}</> : null}</p>
        {a.level && <p className="cr-muted">{a.level}</p>}
        <div className="cr-cert-foot">
          <span>{t.certDate}: <b>{a.awarded_on}</b></span>
          <span>{a.branch_name ?? ""}</span>
          <span>{t.certNo}: <b>{a.certificate_no}</b></span>
        </div>
      </article>
    </>
  );
}
