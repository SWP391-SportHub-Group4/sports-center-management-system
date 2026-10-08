"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";

import { addDaysIso, todayIso } from "@/lib/format";

import { AsyncSection } from "@/components/ui";

import { catalogApi } from "@/features/catalog";

import type { CourtScheduleEntryDto } from "@/lib/types";

import {
  Calendar,
  CalendarEventDrawer,
  type CalendarEvent,
  type CalendarView,
} from "@/components/scheduling";

import { courtScheduleApi } from "./api";

import { CourtFilters } from "./court-filters";

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

  const [view, setView] = useState<CalendarView>("week");

  const [roomId, setRoom] = useState("");

  const [selected, setSelected] = useState<CourtScheduleEntryDto | null>(null);

  const days = view === "day" ? 1 : 7;

  const rooms = useApi((signal) => catalogApi.rooms(signal), []);

  const state = useApi(
    (signal) =>
      courtScheduleApi.list(
        date,
        addDaysIso(date, days - 1),
        roomId,
        user?.role === "Coach",
        signal,
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
        {(roomRows) => (
          <CourtFilters
            date={date}
            roomId={roomId}
            rooms={roomRows}
            onDate={(value) => {
              setDate(value);
              clear();
            }}
            onRoom={(value) => {
              setRoom(value);
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
          type="button"
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
        {(rows) => {
          const filteredRows = rows.filter((entry) =>
            classesOnly
              ? entry.sourceType === "CLASS_SESSION"
              : user?.role === "Coach"
                ? entry.sourceType === "CLASS_SESSION" ||
                  (includeCoachPt && entry.sourceType === "PT_SESSION")
                : true,
          );

          const events: CalendarEvent[] = filteredRows.map((entry) => ({
            id: `${entry.sourceType}-${entry.sourceId}`,
            title: entry.title,
            type: entry.sourceType,
            startAtUtc: entry.startAtUtc,
            endAtUtc: entry.endAtUtc,
            roomName:
              rooms.data?.find((room) => room.roomId === entry.roomId)?.name ??
              null,
            coachName: entry.coachName,
            status: entry.status,
          }));

          return (
            <Calendar
              events={events}
              date={date}
              view={view}
              labels={{
                day: t.calendar.day,
                week: t.calendar.week,
                list: t.calendar.list,
                previous: t.calendar.previous,
                today: t.calendar.today,
                next: t.calendar.next,
                empty: t.calendar.empty,
                eventDetails: t.calendar.eventDetails,
              }}
              onDateChange={(value) => {
                setDate(value);
                clear();
              }}
              onViewChange={(value) => {
                setView(value);
                clear();
              }}
              onSelectEvent={(event) => {
                const entry = filteredRows.find(
                  (candidate) =>
                    `${candidate.sourceType}-${candidate.sourceId}` ===
                    event.id,
                );

                if (entry) {
                  setSelected(entry);
                }
              }}
            />
          );
        }}
      </AsyncSection>

      {selected && (
        <CalendarEventDrawer
          entry={selected}
          roomName={
            rooms.data?.find((room) => room.roomId === selected.roomId)?.name
          }
          manager={user?.role === "CenterManager"}
          coach={user?.role === "Coach"}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
