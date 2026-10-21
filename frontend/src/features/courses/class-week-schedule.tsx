"use client";

import { useState } from "react";
import { Calendar, type CalendarEvent } from "@/components/scheduling";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AsyncSection } from "@/components/ui";
import { courtScheduleApi } from "@/features/court-schedule";
import { groupCenterIncidents } from "@/features/manager";
import { addDaysIso, formatDate, mondayOfIso, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { RoomDto } from "@/lib/types";
import styles from "./class-week-schedule.module.css";
import arrowStyles from "./course-editor.module.css";
import { scheduleConflictFlags } from "./schedule-conflicts";

export function ClassWeekSchedule({
  startDate,
  coachId,
  roomId,
  rooms,
  classId,
  excludeSessionId,
  draftSessions,
}: {
  startDate: string;
  coachId: string;
  roomId: number;
  rooms: RoomDto[];
  classId?: number;
  excludeSessionId?: string;
  draftSessions: { startAtUtc: string; endAtUtc: string }[];
}) {
  const { t } = useLanguage();
  const l = t.classScheduleLookup;
  const [date, setDate] = useState(() => mondayOfIso(startDate || todayIso()));
  const end = addDaysIso(date, 6);
  const hasSelection = !!coachId || !!roomId;
  // Fetch the entire week: a Coach may be busy in a different room or sport.
  const state = useApi(
    (signal) => courtScheduleApi.list(date, end, "", false, signal),
    [date, end],
  );
  const entries = groupCenterIncidents(
    (state.data ?? []).filter(
      (entry) =>
        (!classId || entry.classId !== classId) &&
        (!excludeSessionId ||
          entry.sourceType !== "CLASS_SESSION" ||
          entry.sourceId !== excludeSessionId) &&
        (!hasSelection ||
          entry.incidentScope === "CENTER" ||
          (!!coachId && entry.coachId === coachId) ||
          (!!roomId &&
            (entry.roomId === roomId ||
              entry.affectedRoomIds?.includes(roomId)))),
    ),
  );
  const conflicts = scheduleConflictFlags(
    entries,
    draftSessions,
    coachId,
    roomId,
  );
  const events: CalendarEvent[] = entries.map((entry, index) => ({
    conflict: conflicts[index],
    id: `${entry.sourceType}-${entry.sourceId}-${entry.roomId ?? "center"}`,
    title: entry.title,
    type: entry.sourceType,
    startAtUtc: entry.startAtUtc,
    endAtUtc: entry.endAtUtc,
    roomName:
      entry.incidentScope === "CENTER"
        ? t.incidentHistory.entireCenter
        : rooms.find((room) => room.roomId === entry.roomId)?.name,
    coachName: entry.coachName,
    status: entry.status,
  }));
  function move(next: string) {
    setDate(mondayOfIso(next));
  }

  return (
    <section className={styles.panel} aria-label={l.title}>
      <div className={styles.heading}>
        <div className={styles.caption}>
          <h3>{l.title}</h3>
          <p className={styles.range}>
            {formatDate(date)} &ndash; {formatDate(end)}
          </p>
        </div>
        <div
          className={styles.navigation}
          role="group"
          aria-label={l.navigation}
        >
          <button
            type="button"
            className={`btn btn--secondary ${arrowStyles.arrowButton}`}
            data-direction="previous"
            aria-label={t.mSchedule.prevWeek}
            title={t.mSchedule.prevWeek}
            onClick={() => move(addDaysIso(date, -7))}
          >
            <ArrowLeft size={24} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => move(todayIso())}
          >
            {t.mSchedule.currentWeek}
          </button>
          <button
            type="button"
            className={`btn btn--secondary ${arrowStyles.arrowButton}`}
            data-direction="next"
            aria-label={t.mSchedule.nextWeek}
            title={t.mSchedule.nextWeek}
            onClick={() => move(addDaysIso(date, 7))}
          >
            <ArrowRight size={24} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </div>
      <AsyncSection state={state}>
        {() => (
          <>
            {!events.length && (
              <p role="status" className="muted">
                {l.empty}
              </p>
            )}
            <Calendar
              date={date}
              view="week"
              events={events}
              hideToolbar
              labels={{
                ...t.calendar,
                weekdays: t.mSchedule.weekdays,
                empty: l.emptyDay,
                conflict: l.conflict,
              }}
              onDateChange={move}
            />
          </>
        )}
      </AsyncSection>
    </section>
  );
}
