import { loadViewer } from "@/lib/cr360/viewer";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized, Planned } from "@/components/cr360/Blocks";

export default async function ParentPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "parent")) return <Unauthorized t={t} />;
  return (
    <>
      <h1 className="cr-h1">{t.ws_parent}</h1>
      <Planned t={t} title="Guardian portal" phase="Phase 3"
        blockers={[
          "Migration 0005: verified guardian ↔ student links + consent (child branch is NOT authorisation)",
          "Legacy public token portal (/p/[token]) reviewed: security-definer view v_parent_portal",
          "Private media bucket with signed, expiring URLs",
        ]} />
    </>
  );
}
