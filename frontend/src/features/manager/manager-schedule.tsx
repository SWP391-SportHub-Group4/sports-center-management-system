"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery, choiceQuery } from "@/lib/useUrlQuery";
import { todayIso, addDaysIso, formatDate } from "@/lib/format";
import styles from "./manager-schedule.module.css";
import { Button } from "@/components/primitives";
import { mondayOf } from "./schedule-week";
import { AsyncSection, Card, Field } from "@/components/ui";
import { FilterBar } from "@/components/data";
import {
  Calendar,
  CalendarEventDrawer,
  type CalendarEvent,
} from "@/components/scheduling";
import { catalogApi } from "@/features/catalog";
import { courtScheduleApi } from "@/features/court-schedule";
import { groupCenterIncidents } from "./schedule-incidents";

import { useRouter } from "next/navigation";

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
  const { t } = useLanguage();
  const router = useRouter();
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
  useEffect(() => {
    if (values.section === "requests" && !fixedCoach && !fixedRoom)
      router.replace("/manager/requests?type=coach");
  }, [values.section, fixedCoach, fixedRoom, router]);
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
  const rows = groupCenterIncidents(
    (state.data ?? []).filter(
      (r) =>
        (!classesOnly || r.sourceType === "CLASS_SESSION") &&
        (!(fixedCoach || values.coachId) ||
          r.coachId === (fixedCoach || values.coachId)) &&
        (!values.classId || String(r.classId) === values.classId) &&
        (!values.sourceType || r.sourceType === values.sourceType),
    ),
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
      r.incidentScope === "CENTER"
        ? t.incidentHistory.entireCenter
        : (rooms.data?.find((room) => room.roomId === r.roomId)?.name ?? null),
    coachName: r.coachName,
    status: r.status,
  }));
  return (
    <>
      <Card>
        <div className={styles.weekToolbar}>
          <Field label={l.date}>
            <input
              type="date"
              value={values.date}
              onChange={(e) => {
                if (e.target.value)
                  update(
                    values.view === "day"
                      ? { date: e.target.value }
                      : { date: mondayOf(e.target.value), view: "week" },
                  );
              }}
            />
          </Field>
          <div className={styles.weekNavigation}>
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
                  className={styles.viewButton}
                  aria-pressed={values.view === view}
                  onClick={() =>
                    update({
                      view,
                      date:
                        view === "day" ? values.date : mondayOf(values.date),
                    })
                  }
                >
                  {t.calendar[view]}
                </Button>
              ))}
            </div>
            <div className={styles.dateNavigation}>
              <Button
                variant="secondary"
                size="sm"
                className={styles.arrowButton}
                data-direction="previous"
                aria-label={
                  values.view === "day"
                    ? t.calendar.previous
                    : t.mSchedule.prevWeek
                }
                title={
                  values.view === "day"
                    ? t.calendar.previous
                    : t.mSchedule.prevWeek
                }
                onClick={() =>
                  update({
                    date: addDaysIso(
                      values.date,
                      values.view === "day" ? -1 : -7,
                    ),
                  })
                }
              >
                <ArrowLeft size={22} strokeWidth={2.25} aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={styles.currentButton}
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
                className={styles.arrowButton}
                data-direction="next"
                aria-label={
                  values.view === "day" ? t.calendar.next : t.mSchedule.nextWeek
                }
                title={
                  values.view === "day" ? t.calendar.next : t.mSchedule.nextWeek
                }
                onClick={() =>
                  update({
                    date: addDaysIso(
                      values.date,
                      values.view === "day" ? 1 : 7,
                    ),
                  })
                }
              >
                <ArrowRight size={22} strokeWidth={2.25} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
        <div className={styles.filters}>
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
                label: t.classWorkspace.classLabel,
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
            actions={<></>}
          />
        </div>
      </Card>
      {rooms.error && <p role="alert">{rooms.error.message}</p>}
      <AsyncSection state={state}>
        {() => (
          <Card
            title={
              days === 1
                ? formatDate(calendarDate)
                : [
                    formatDate(calendarDate),
                    formatDate(addDaysIso(calendarDate, days - 1)),
                  ].join(" \u2013 ")
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
          affectedRoomNames={selected.affectedRoomIds
            ?.map((id) => rooms.data?.find((r) => r.roomId === id)?.name)
            .filter((name): name is string => !!name)}
          manager
          onChanged={state.reload}
          onClose={() => setSelected("")}
        />
      )}
    </>
  );
}
