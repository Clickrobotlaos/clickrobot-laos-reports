import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace, studentBranchScope } from "@/lib/cr360/access";
import { businessDate, dict, type DictKey } from "@/lib/cr360/i18n";
import { dayOfWeek, findConflicts, occupancy, weekGrid, type LegacyClass } from "@/lib/cr360/timetable";
import { loadScopedClasses, loadStaffNames } from "@/lib/cr360/legacy-classes";
import { loadNames } from "@/lib/cr360/legacy-students";
import { Unauthorized } from "@/components/cr360/Blocks";
import { ClassroomFill } from "@/components/cr360/ClassroomFill";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "classes")) return <Unauthorized t={t} />;
  const sp = await searchParams;
  const date = sp.date && ISO.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : businessDate();
  const dow = dayOfWeek(date);

  const scope = studentBranchScope(ctx.viewer);
  const sb = await supabaseServer();
  const [{ classes, bookings, allForConflicts, error }, staff, names] = await Promise.all([
    loadScopedClasses(sb, scope), loadStaffNames(sb), loadNames(sb),
  ]);
  const inScope = new Set(classes.map((c) => c.id));
  const byId = new Map(allForConflicts.map((c) => [c.id, c]));
  // Show only conflicts that involve at least one class the viewer manages; hide other-branch details.
  const conflicts = findConflicts(allForConflicts).filter((c) => inScope.has(c.a) || inScope.has(c.b));
  const dayName = (d: number) => t[`day${d}` as DictKey];
  const clsLabel = (id: string) => (inScope.has(id) ? byId.get(id)?.name ?? "—" : "(another branch)");
  const today = classes.filter((c) => c.day_of_week === dow).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const hhmm = (s: string | null) => (s ?? "").slice(0, 5);

  const card = (c: LegacyClass, big: boolean) => {
    const o = occupancy(c, bookings, date);
    // Day view counts regulars + that date's makeups; the weekly view shows standing (regular) enrolment only.
    const shown = big ? o.used : o.regular;
    const pct = o.capacity ? Math.min(100, (shown / o.capacity) * 100) : 0;
    const wFull = o.capacity !== null && o.regular >= o.capacity, wOver = o.capacity !== null && o.regular > o.capacity;
    const label = `${c.name}: ${o.used} ${t.seatsUsed}${o.capacity ? ` / ${o.capacity}` : ` (${t.unlimited})`}`;
    return big ? (
      <section key={c.id} className="cr-card" aria-label={c.name}>
        <h2 style={{ marginBottom: 4 }}>{c.name} {o.over ? <span className="cr-badge rejected">{t.overCapacity}</span> : o.full ? <span className="cr-badge pending">{t.full}</span> : null}</h2>
        <p className="cr-muted" style={{ margin: 0 }}>
          {hhmm(c.start_time)}–{hhmm(c.end_time)} · {names.branch.get(c.branch_id) ?? "—"}{c.room ? ` · ${t.room} ${c.room}` : ""}
          {c.teacher_id ? ` · ${t.teacher}: ${staff.get(c.teacher_id) ?? "—"}` : ""}
        </p>
        <ClassroomFill capacity={o.capacity} used={o.used} label={label} />
        <p style={{ margin: 0 }}><b>{o.used}</b>{o.capacity ? ` / ${o.capacity}` : ""} {t.seatsUsed}{o.makeup ? ` · ${o.makeup} ${t.makeupsToday}` : ""}{!o.capacity ? ` · ${t.unlimited}` : ""}</p>
      </section>
    ) : (
      <div key={c.id} className="cr-slot">
        <b>{c.name}</b>
        <span className="cr-muted">{hhmm(c.start_time)}–{hhmm(c.end_time)}{c.room ? ` · ${c.room}` : ""}</span>
        <div className={`cr-fill ${wOver ? "over" : wFull ? "full" : ""}`} role="img" aria-label={`${c.name}: ${o.regular}${o.capacity ? ` / ${o.capacity}` : ""}`}><span style={{ width: `${pct}%` }} /></div>
        <span className="cr-muted">{o.regular}{o.capacity ? `/${o.capacity}` : ""}</span>
      </div>
    );
  };

  return (
    <>
      <h1 className="cr-h1">{t.ws_classes}</h1>
      <p className="cr-sub">{t.classesSub} {scope === null ? t.scopeAll : t.scopeBranch}</p>
      <div className="cr-banner info">{t.legacyReadNote} {t.seatMapNote}</div>
      {error && <div className="cr-banner bad">{t.err_server_error}</div>}

      {conflicts.length > 0 && (
        <section className="cr-card" role="alert" style={{ borderColor: "var(--c-bad)" }}>
          <h2>{t.conflicts} ({conflicts.length})</h2>
          <ul className="cr-list">{conflicts.map((c, i) => (
            <li key={i}>
              <span><b>{c.kind === "teacher" ? t.conflictTeacher : t.conflictRoom}</b> · {dayName(c.day)} · {clsLabel(c.a)} ↔ {clsLabel(c.b)}</span>
              <span className="cr-muted">{c.kind === "teacher" ? staff.get(c.who) ?? "—" : c.who}</span>
            </li>
          ))}</ul>
        </section>
      )}

      {classes.length === 0 ? <div className="cr-card" style={{ marginTop: 14 }}><p>{t.noClasses}</p></div> : (
        <>
          <form method="get" action="/360/classes" className="cr-form" style={{ maxWidth: 360, marginTop: 14 }}>
            <div className="cr-field">
              <label htmlFor="d">{t.changeDate}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="d" name="date" type="date" defaultValue={date} />
                <button className="cr-btn ghost" type="submit">→</button>
              </div>
            </div>
          </form>

          <h2 style={{ fontSize: 18, margin: "18px 0 10px" }}>{t.onDate} {date} ({dayName(dow)})</h2>
          {today.length === 0 ? <p className="cr-muted">{t.noClassesDay}</p> : <div className="cr-grid c3">{today.map((c) => card(c, true))}</div>}

          <h2 style={{ fontSize: 18, margin: "22px 0 10px" }}>{t.weekTimetable}</h2>
          <div className="cr-week">
            {weekGrid(classes).map((d) => (
              <div key={d.day}>
                <h3>{d.day === dow ? <Link href={`/360/classes?date=${date}`}>{dayName(d.day)} ●</Link> : dayName(d.day)}</h3>
                {d.classes.length === 0 ? <p className="cr-muted" style={{ fontSize: 13 }}>—</p> : d.classes.map((c) => card(c, false))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
