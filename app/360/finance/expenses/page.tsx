import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { hasRole, studentBranchScope } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { ExpenseQueue, ExpenseRequestForm, ManagerLimitForm, type ExpenseRow } from "@/components/cr360/BranchFinance";

export const dynamic = "force-dynamic";

/** Branch managers, the CEO and finance: expense requests for their branches (RLS decides rows; 0019). */
export default async function ExpensesPage() {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !hasRole(ctx.viewer, ["ceo", "manager", "finance"])) return <Unauthorized t={t} />;
  const isCeo = hasRole(ctx.viewer, ["ceo"]);
  const sb = await supabaseServer();
  const [reqRes, brRes, limRes] = await Promise.all([
    sb.from("cr360_expense_requests").select("id,branch_id,category,description,amount,currency,amount_lak,status,requested_by,created_at").order("created_at", { ascending: false }).limit(200),
    sb.from("branches").select("id,name").order("name"),
    sb.rpc("cr360_manager_expense_limit"),
  ]);
  if (reqRes.error) return (<><h1 className="cr-h1">{t.expenseRequests}</h1><div className="cr-banner info">{t.financeNotEnabled}</div></>);
  const names = new Map(((brRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const rows: ExpenseRow[] = ((reqRes.data ?? []) as { id: string; branch_id: string; category: string; description: string; amount: number; currency: string; amount_lak: number; status: string; requested_by: string; created_at: string }[])
    .map((r) => ({ ...r, branch: names.get(r.branch_id) ?? "—", mine: r.requested_by === ctx.viewer!.userId }));
  const myBranches = isCeo ? [...names.keys()] : (studentBranchScope(ctx.viewer) ?? []);
  const pending = rows.filter((r) => r.status === "pending" || r.status === "approved");
  const done = rows.filter((r) => !(r.status === "pending" || r.status === "approved")).slice(0, 30);
  return (
    <>
      <Link href="/360" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>🧾 {t.expenseRequests}</h1>
      <p className="cr-sub">{t.expensesNote}</p>
      <div className="cr-grid" style={{ gap: 14 }}>
        <section className="cr-card"><h2>{t.exSt_pending} / {t.exSt_approved}</h2>
          <ExpenseQueue rows={pending} canDecide={isCeo || hasRole(ctx.viewer, ["manager"])} canPay t={t} /></section>
        {myBranches[0] && <section className="cr-card"><h2>{t.requestExpense}</h2><ExpenseRequestForm branchId={myBranches[0]} t={t} /></section>}
        {isCeo && <section className="cr-card"><h2>{t.managerLimit}</h2><ManagerLimitForm current={limRes.error ? null : Number(limRes.data)} t={t} /></section>}
        <section className="cr-card"><h2>{t.history}</h2><ExpenseQueue rows={done} canDecide={false} canPay={false} t={t} /></section>
      </div>
    </>
  );
}
