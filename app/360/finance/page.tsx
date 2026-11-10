import { loadViewer } from "@/lib/cr360/viewer";
import { canUseWorkspace } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized, Planned } from "@/components/cr360/Blocks";

export default async function FinancePage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "finance")) return <Unauthorized t={t} />;
  return (
    <>
      <h1 className="cr-h1">{t.ws_finance}</h1>
      <div className="cr-grid c2">
        <Planned t={t} title="Invoices, payments & package credits" phase="Phase 1b"
          blockers={["Migration 0003: atomic payment → allocation → package credit, idempotent provider events, minor units + rate snapshots"]} />
        <Planned t={t} title="Daily cashbook, close & P&L" phase="Phase 4"
          blockers={["Branch-scoped finance grants", "Executive finance isolated in a non-exposed schema (CEO / explicit partner grants only)"]} />
      </div>
    </>
  );
}
