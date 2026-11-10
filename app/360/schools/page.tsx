import { loadViewer } from "@/lib/cr360/viewer";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized, Planned } from "@/components/cr360/Blocks";

export default async function SchoolsPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "schools")) return <Unauthorized t={t} />;
  return (
    <>
      <h1 className="cr-h1">{t.ws_schools}</h1>
      <Planned t={t} title="School partners & franchise" phase="Phase 4 / 5"
        blockers={[
          "Current contract terms for Sharon International School and ISL Pakse (not assumed)",
          "Phomsouvan franchise agreement figures from the signed contract",
          "Separate legal-entity books for franchisees",
        ]} />
    </>
  );
}
