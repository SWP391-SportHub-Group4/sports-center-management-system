"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { addDaysIso, todayIso, formatDate, formatDateTime } from "@/lib/format";
import { AsyncSection, StatusChip } from "@/components/ui";
import { catalogApi } from "@/features/catalog";
import type { CourtScheduleEntryDto } from "@/lib/types";
import { courtScheduleApi } from "./api";
import { CourtFilters } from "./court-filters";
import { OccupancyDetail } from "./occupancy-detail";
import styles from "./court-calendar.module.css";
export function CourtCalendar({
  classesOnly = false,
  includeCoachPt = false,
}: {
  classesOnly?: boolean;
  includeCoachPt?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const l = t.operations;
  const [date, setDate] = useState(todayIso());
  const [days, setDays] = useState(7);
  const [roomId, setRoom] = useState("");
  const [selected, setSelected] = useState<CourtScheduleEntryDto | null>(null);
  const rooms = useApi((s) => catalogApi.rooms(s), []);
  const state = useApi(
    (s) =>
      courtScheduleApi.list(
        date,
        addDaysIso(date, days - 1),
        roomId,
        user?.role === "Coach",
        s,
        includeCoachPt,
      ),
    [date, days, roomId, user?.role, includeCoachPt],
  );
  const labels = {
    CLASS_SESSION: l.classSession,
    PT_SESSION: l.ptSession,
    COURT_RENTAL: l.rental,
    ROOM_BLOCK: l.roomBlock,
  };
  function clear() {
    setSelected(null);
  }
  return (
    <>
      <AsyncSection state={rooms}>
        {(rows) => (
          <CourtFilters
            date={date}
            days={days}
            roomId={roomId}
            rooms={rows}
            onDate={(v) => {
              setDate(v);
              clear();
            }}
            onDays={(v) => {
              setDays(v);
              clear();
            }}
            onRoom={(v) => {
              setRoom(v);
              clear();
            }}
          />
        )}
      </AsyncSection>
      <p>{l.timeZone}</p>
      <div className="btn-row">
        {Object.entries(labels)
          .filter(([type]) =>
            classesOnly
              ? type === "CLASS_SESSION"
              : user?.role === "Coach"
                ? type === "CLASS_SESSION" ||
                  (includeCoachPt && type === "PT_SESSION")
                : true,
          )
          .map(([, label]) => (
            <span className={`chip ${styles.legendChip}`} key={label}>
              {label}
            </span>
          ))}
        <button
          className="btn btn--ghost"
          onClick={() => {
            state.reload();
            clear();
          }}
        >
          {l.refresh}
        </button>
      </div>
      <AsyncSection state={state}>
        {(rows) => (
          <div className={styles.calendar}>
            {Array.from({ length: days }, (_, i) => {
              const day = addDaysIso(date, i);
              const items = rows.filter(
                (r) =>
                  (!classesOnly || r.sourceType === "CLASS_SESSION") &&
                  new Date(new Date(r.startAtUtc).getTime() + 7 * 3600000)
                    .toISOString()
                    .slice(0, 10) === day,
              );
              return (
                <section key={day} className={styles.day}>
                  <h2>
                    <time dateTime={day}>{formatDate(day)}</time>
                  </h2>
                  {!items.length && <p>{l.empty}</p>}
                  {items.map((r) => (
                    <button
                      className={styles.entry}
                      key={`${r.sourceType}-${r.sourceId}`}
                      onClick={() => setSelected(r)}
                    >
                      <strong>
                        {labels[r.sourceType]} · {r.title}
                      </strong>
                      <span>
                        {formatDateTime(r.startAtUtc)} –{" "}
                        {formatDateTime(r.endAtUtc)}
                      </span>
                      <span>
                        {rooms.data?.find((room) => room.roomId === r.roomId)
                          ?.name ?? "—"}{" "}
                        · {r.coachName}
                      </span>
                      <StatusChip value={r.status} />
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </AsyncSection>
      {selected && (
        <OccupancyDetail
          entry={selected}
          manager={user?.role === "CenterManager"}
        />
      )}
    </>
  );
}
