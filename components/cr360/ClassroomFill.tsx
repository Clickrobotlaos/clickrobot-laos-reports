import { seatGrid } from "@/lib/cr360/timetable";

/** Server-rendered 2.5D seat map. Purely a visualisation of booking counts; the label is the accessible source. */
export function ClassroomFill({ capacity, used, label }: { capacity: number | null; used: number; label: string }) {
  const g = seatGrid(capacity, used);
  return (
    <div className="cr-room-wrap" role="img" aria-label={label}>
      <div className="cr-room" style={{ gridTemplateColumns: `repeat(${g.cols}, 26px)` }} aria-hidden="true">
        {g.seats.map((s, i) => <span key={i} className={`cr-seat ${s === "free" ? "" : s}`} />)}
      </div>
    </div>
  );
}
