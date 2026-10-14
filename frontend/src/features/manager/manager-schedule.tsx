"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery, choiceQuery } from "@/lib/useUrlQuery";
import { todayIso, addDaysIso, formatDate } from "@/lib/format";
import styles from "./manager-schedule.module.css";
import { Button } from "@/components/primitives";
import { mondayOf, isoWeek, weekMonday } from "./schedule-week";
import { AsyncSection, Card, Field } from "@/components/ui";
import { FilterBar } from "@/components/data";
import {
  Calendar,
  CalendarEventDrawer,
  type CalendarEvent,
} from "@/components/scheduling";
import { catalogApi } from "@/features/catalog";
import { courtScheduleApi } from "@/features/court-schedule";

import { ManagerClassChangeRequests } from "./class-change-requests";
import { classChangeStyles as changeStyles } from "@/features/pt";

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
    ? value
    : todayIso();
export function ManagerSchedule({
  classesOnly = false,
  coachId: fixedCoach,
  roomId: fixedRoom,
}: {
  classesOnly?: boolean;
  coachId?: string;
  roomId?: number;
}) {
  const { t, language } = useLanguage();
  const l = t.operations;
  const m = t.managerOperations;
  const { values, setValues } = useUrlQuery(
    {
      date: mondayOf(todayIso()),
      view: "week",
      roomId: "",
      coachId: "",
      classId: "",
      sourceType: "",
      section: "calendar",
    },
    {
      date: validDate,
      section: choiceQuery(["calendar", "requests"], "calendar"),
      view: choiceQuery(["day", "week", "list"], "week"),
      sourceType: choiceQuery(
        ["", "CLASS_SESSION", "COURT_RENTAL", "ROOM_BLOCK"],
        "",
      ),
    },
  );
  const [selectedId, setSelected] = useState("");
  const calendarDate =
    values.view === "week" ? mondayOf(values.date) : values.date;
  const days = values.view === "day" ? 1 : 7;
  const roomId = fixedRoom ? String(fixedRoom) : values.roomId;
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const state = useApi(
    (signal) =>
      courtScheduleApi.list(
        calendarDate,
        addDaysIso(calendarDate, days - 1),
        roomId,
        false,
        signal,
      ),
    [calendarDate, days, roomId],
  );
  const rows = (state.data ?? []).filter(
    (r) =>
      (!classesOnly || r.sourceType === "CLASS_SESSION") &&
      (!(fixedCoach || values.coachId) ||
        r.coachId === (fixedCoach || values.coachId)) &&
      (!values.classId || String(r.classId) === values.classId) &&
      (!values.sourceType || r.sourceType === values.sourceType),
  );
  const selected = rows.find(
    (r) => `${r.sourceType}-${r.sourceId}` === selectedId,
  );
  const coaches = [
    ...new Map(
      (state.data ?? [])
        .filter((r) => r.coachId)
        .filter((r) => r.coachName?.trim())
        .map((r) => [r.coachId!, r.coachName!]),
    ).entries(),
  ];
  const classes = [
    ...new Map(
      (state.data ?? [])
        .filter((r) => r.classId)
        .map((r) => [r.classId!, r.title]),
    ).entries(),
  ];
  function update(next: Record<string, string>) {
    setValues(next);
    setSelected("");
  }
  const events: CalendarEvent[] = rows.map((r) => ({
    id: `${r.sourceType}-${r.sourceId}`,
    title: r.title,
    type: r.sourceType,
    startAtUtc: r.startAtUtc,
    endAtUtc: r.endAtUtc,
    roomName:
      rooms.data?.find((room) => room.roomId === r.roomId)?.name ?? null,
    coachName: r.coachName,
    status: r.status,
  }));
  const sectionNav = !fixedCoach && !fixedRoom && (
    <nav
      className={changeStyles.bookmarks}
      aria-label={language === "vi" ? "Quản lý lịch" : "Schedule management"}
    >
      <button
        type="button"
        className={`btn btn--sm ${values.section === "calendar" ? "" : "btn--quiet"}`}
        aria-pressed={values.section === "calendar"}
        onClick={() => setValues({ section: "calendar" })}
      >
        {language === "vi" ? "Lịch hoạt động" : "Activity calendar"}
      </button>
      <button
        type="button"
        className={`btn btn--sm ${values.section === "requests" ? "" : "btn--quiet"}`}
        aria-pressed={values.section === "requests"}
        onClick={() => setValues({ section: "requests" })}
      >
        {language === "vi" ? "Yêu cầu đổi lịch lớp" : "Class change requests"}
      </button>
    </nav>
  );
  if (values.section === "requests" && !fixedCoach && !fixedRoom)
    return (
      <>
        {sectionNav}
        <ManagerClassChangeRequests onChanged={() => state.reload()} />
      </>
    );
  return (
    <>
      {sectionNav}
      <Card>
        <div className={styles.weekToolbar}>
          <Field
            label={values.view === "day" ? l.date : t.mSchedule.chooseWeek}
          >
            <input
              type={values.view === "day" ? "date" : "week"}
              value={values.view === "day" ? values.date : isoWeek(values.date)}
              onChange={(e) => {
                if (e.target.value)
                  update(
                    values.view === "day"
                      ? { date: e.target.value }
                      : { date: weekMonday(e.target.value), view: "week" },
                  );
              }}
            />
          </Field>
          <div
            className={styles.viewNavigation}
            role="group"
            aria-label={t.mSchedule.viewLabel}
          >
            {(["day", "week", "list"] as const).map((view) => (
              <Button
                key={view}
                variant="secondary"
                size="sm"
                aria-pressed={values.view === view}
                onClick={() =>
                  update({
                    view,
                    date: view === "day" ? values.date : mondayOf(values.date),
                  })
                }
              >
                {t.calendar[view]}
              </Button>
            ))}
          </div>
          <div className={styles.weekNavigation}>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={16} aria-hidden="true" />}
              onClick={() =>
                update({
                  date: addDaysIso(
                    values.date,
                    values.view === "day" ? -1 : -7,
                  ),
                })
              }
            >
              {values.view === "day"
                ? t.calendar.previous
                : t.mSchedule.prevWeek}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                update({
                  date:
                    values.view === "day" ? todayIso() : mondayOf(todayIso()),
                })
              }
            >
              {values.view === "day"
                ? t.calendar.today
                : t.mSchedule.currentWeek}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                update({
                  date: addDaysIso(values.date, values.view === "day" ? 1 : 7),
                })
              }
            >
              {values.view === "day" ? t.calendar.next : t.mSchedule.nextWeek}
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <details className={styles.filters}>
          <summary>{t.common.filter}</summary>
          <FilterBar
            values={values}
            onChange={update}
            activeCount={
              [
                !fixedRoom && values.roomId,
                !fixedCoach && values.coachId,
                values.classId,
                !classesOnly && values.sourceType,
              ].filter(Boolean).length
            }
            fields={[
              ...(!fixedRoom
                ? [
                    {
                      id: "roomId",
                      label: l.room,
                      kind: "select" as const,
                      options: [
                        { value: "", label: l.all },
                        ...(rooms.data ?? []).map((r) => ({
                          value: String(r.roomId),
                          label: r.name,
                        })),
                      ],
                    },
                  ]
                : []),
              ...(!fixedCoach
                ? [
                    {
                      id: "coachId",
                      label: l.coach,
                      kind: "select" as const,
                      options: [
                        { value: "", label: l.all },
                        ...coaches.map(([value, label]) => ({ value, label })),
                      ],
                    },
                  ]
                : []),
              {
                id: "classId",
                label: l.courses,
                kind: "select",
                options: [
                  { value: "", label: l.all },
                  ...classes.map(([id, label]) => ({
                    value: String(id),
                    label,
                  })),
                ],
              },
              ...(!classesOnly
                ? [
                    {
                      id: "sourceType",
                      label: m.source,
                      kind: "select" as const,
                      options: [
                        { value: "", label: l.all },
                        ...Object.entries(t.calendar.types).map(
                          ([value, label]) => ({ value, label }),
                        ),
                      ],
                    },
                  ]
                : []),
            ]}
            onReset={() =>
              update({ roomId: "", coachId: "", classId: "", sourceType: "" })
            }
            actions={
              <>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    state.reload();
                    setSelected("");
                  }}
                >
                  {l.refresh}
                </button>
              </>
            }
          />
        </details>
      </Card>
      {rooms.error && <p role="alert">{rooms.error.message}</p>}
      <AsyncSection state={state}>
        {() => (
          <Card
            title={
              formatDate(calendarDate) +
              " – " +
              formatDate(addDaysIso(calendarDate, days - 1))
            }
          >
            <Calendar
              events={events}
              date={calendarDate}
              view={values.view as "day" | "week" | "list"}
              hideToolbar
              labels={{
                types: t.calendar.types,
                weekdays: t.mSchedule.weekdays,
                day: t.calendar.day,
                week: t.calendar.week,
                list: t.calendar.list,
                previous: t.calendar.previous,
                today: t.calendar.today,
                next: t.calendar.next,
                empty: t.calendar.empty,
                eventDetails: t.calendar.eventDetails,
              }}
              onDateChange={(date) => update({ date })}
              onViewChange={(view) => update({ view })}
              onSelectEvent={(event) => setSelected(event.id)}
            />
          </Card>
        )}
      </AsyncSection>
      {selected && (
        <CalendarEventDrawer
          entry={selected}
          roomName={rooms.data?.find((r) => r.roomId === selected.roomId)?.name}
          manager
          onClose={() => setSelected("")}
        />
      )}
    </>
  );
}
