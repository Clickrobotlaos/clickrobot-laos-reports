import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { Conversation, ThreadList, type MessageRow, type ThreadRow } from "@/components/cr360/Messages";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff inbox for parent messages. The database (0018) returns only conversations about children this
 * person teaches (incl. assigned substitute) or manages; everyone else sees an empty list.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !ctx.viewer.grants.some((g) => g.active)) return <Unauthorized t={t} />;
  const sb = await supabaseServer();
  const thRes = await sb.from("cr360_message_threads").select("id,student_code,subject,status,last_message_at,staff_read_at")
    .order("last_message_at", { ascending: false }).limit(100);
  if (thRes.error) {
    return (<><h1 className="cr-h1">{t.parentMessages}</h1><div className="cr-banner info">{t.messagesNotEnabled}</div></>);
  }
  const raw = (thRes.data ?? []) as { id: string; student_code: string; subject: string; status: string; last_message_at: string; staff_read_at: string | null }[];
  const codes = [...new Set(raw.map((r) => r.student_code))];
  const { data: pk } = codes.length ? await sb.from("student_packages").select("student_id,student_name").in("student_id", codes).limit(1000) : { data: [] };
  const nameOf = new Map(((pk ?? []) as { student_id: string; student_name: string }[]).map((p) => [p.student_id, p.student_name]));
  const threads: ThreadRow[] = raw.map((r) => ({ ...r, unread: !r.staff_read_at || r.staff_read_at < r.last_message_at, label: nameOf.get(r.student_code) ?? r.student_code }));
  const wanted = (await searchParams).thread;
  const open = wanted && UUID.test(wanted) ? threads.find((x) => x.id === wanted) ?? null : null;
  const msgs = open ? ((await sb.from("cr360_messages").select("id,sender_side,body,created_at").eq("thread_id", open.id).order("id").limit(500)).data ?? []) as MessageRow[] : [];
  return (
    <>
      <Link href="/360" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>💬 {t.parentMessages}</h1>
      <p className="cr-sub">{t.staffMessagesNote}</p>
      <div className="cr-grid" style={{ gap: 14 }}>
        <section className="cr-card"><ThreadList threads={threads} current={open?.id ?? null} hrefBase="/360/messages?" t={t} /></section>
        {open && (
          <section className="cr-card" aria-label={open.subject}>
            <h2 style={{ marginTop: 0 }}>{open.subject} · <span className="cr-muted">{open.label}</span></h2>
            <Conversation threadId={open.id} messages={msgs} side="staff" canClose status={open.status} t={t} />
          </section>
        )}
      </div>
    </>
  );
}
