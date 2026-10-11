"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";

import { addDaysIso, todayIso } from "@/lib/format";

import { AsyncSection, Field } from "@/components/ui";

import { catalogApi } from "@/features/catalog";

import type { CourtScheduleEntryDto } from "@/lib/types";

import {
  Calendar,
  CalendarEventDrawer,
  type CalendarEvent,
  type CalendarView,
  PlanningCalendar,
  planningRange,
  type PlanningView,
} from "@/components/scheduling";

import { courtScheduleApi } from "./api";

import { CourtFilters } from "./court-filters";

import styles from "./court-calendar.module.css";

export function CourtCalendar({
  classesOnly = false,
  includeCoachPt = false,
  onSelectPtSession,
  planningLayout = false,
  refreshToken = 0,
}: {
  classesOnly?: boolean;
  includeCoachPt?: boolean;
  onSelectPtSession?: (sessionId: string) => void;
  planningLayout?: boolean;
  refreshToken?: number;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const l = t.operations;

  const [date, setDate] = useState(todayIso());

  const [view, setView] = useState<PlanningView>(
    planningLayout ? "month" : "week",
  );

  const [roomId, setRoom] = useState("");

  const [selected, setSelected] = useState<CourtScheduleEntryDto | null>(null);

  const range = planningLayout
    ? planningRange(date, view)
    : { start: date, days: view === "day" ? 1 : 7 };

  const rooms = useApi((signal) => catalogApi.rooms(signal), []);

  const state = useApi(
    async (signal) => {
      const batches = await Promise.all(
        Array.from({ length: Math.ceil(range.days / 31) }, (_, index) =>
          courtScheduleApi.list(
            addDaysIso(range.start, index * 31),
            addDaysIso(range.start, Math.min(range.days, (index + 1) * 31) - 1),
            roomId,
            user?.role === "Coach",
            signal,
            includeCoachPt,
          ),
        ),
      );
      return [
        ...new Map(
          batches
            .flat()
            .map((entry) => [`${entry.sourceType}-${entry.sourceId}`, entry]),
        ).values(),
      ];
    },
    [range.start, range.days, roomId, user?.role, includeCoachPt, refreshToken],
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
        {(roomRows) =>
          planningLayout ? (
            <div className="row spread">
              <Field label={l.room}>
                <select
                  value={roomId}
                  onChange={(e) => {
                    setRoom(e.target.value);
                    clear();
                  }}
                >
                  <option value="">{t.common.all}</option>
                  {roomRows.map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="btn btn--secondary"
                onClick={() => {
                  state.reload();
                  clear();
                }}
              >
                {l.refresh}
              </button>
            </div>
          ) : (
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
          )
        }
      </AsyncSection>

      {!planningLayout && (
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
      )}

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

          const selectEvent = (event: CalendarEvent) => {
            const entry = filteredRows.find(
              (candidate) =>
                `${candidate.sourceType}-${candidate.sourceId}` === event.id,
            );
            if (entry) {
              if (entry.sourceType === "PT_SESSION" && onSelectPtSession)
                onSelectPtSession(entry.sourceId);
              else setSelected(entry);
            }
          };
          if (planningLayout)
            return (
              <PlanningCalendar
                events={events}
                date={date}
                view={view}
                onDateChange={(value) => {
                  setDate(value);
                  clear();
                }}
                onViewChange={(value) => {
                  setView(value);
                  clear();
                }}
                onSelectEvent={selectEvent}
              />
            );
          return (
            <Calendar
              events={events}
              date={date}
              view={view as CalendarView}
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
              onSelectEvent={selectEvent}
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
