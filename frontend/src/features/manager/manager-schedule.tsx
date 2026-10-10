"use client";
import { useState } from "react";
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
    },
    {
      date: (value) => mondayOf(validDate(value)),
      view: choiceQuery(["week"], "week"),
      sourceType: choiceQuery(
        ["", "CLASS_SESSION", "PT_SESSION", "COURT_RENTAL", "ROOM_BLOCK"],
        "",
      ),
    },
  );
  const [selectedId, setSelected] = useState("");
  const days = 7;
  const roomId = fixedRoom ? String(fixedRoom) : values.roomId;
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const state = useApi(
    (signal) =>
      courtScheduleApi.list(
        values.date,
        addDaysIso(values.date, days - 1),
        roomId,
        false,
        signal,
      ),
    [values.date, days, roomId],
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
  return (
    <>
      <Card>
        <div className={styles.weekToolbar}>
          <Field label={t.mSchedule.chooseWeek}>
            <input
              type="week"
              value={isoWeek(values.date)}
              onChange={(e) => {
                if (e.target.value)
                  update({ date: weekMonday(e.target.value), view: "week" });
              }}
            />
          </Field>
          <div className={styles.weekNavigation}>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => update({ date: addDaysIso(values.date, -7) })}
            >
              {t.mSchedule.prevWeek}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => update({ date: mondayOf(todayIso()) })}
            >
              {t.mSchedule.currentWeek}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => update({ date: addDaysIso(values.date, 7) })}
            >
              {t.mSchedule.nextWeek}
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
              formatDate(values.date) +
              " – " +
              formatDate(addDaysIso(values.date, 6))
            }
          >
            <Calendar
              events={events}
              date={values.date}
              view="week"
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
