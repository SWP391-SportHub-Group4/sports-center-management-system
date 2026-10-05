"use client";

import Link from "next/link";
import { useState } from "react";
import { Calendar, type CalendarView } from "@/components/scheduling";
import { Drawer } from "@/components/primitives";
import { AsyncSection, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, todayIso } from "@/lib/format";
import { memberSchedule, type MemberEvent } from "./api";
import { useUrlQuery } from "@/lib/useUrlQuery";

function scheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayIso();
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : todayIso();
}

export function MemberSchedule() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { date: todayIso() },
    { date: scheduleDate },
  );
  const date = values.date;
  const [view, setView] = useState<CalendarView>("week");
  const [selected, setSelected] = useState<MemberEvent | null>(null);
  const days = view === "day" ? 1 : 7;
  const state = useApi(
    (signal) => memberSchedule(date, days, signal),
    [date, days],
  );
  return (
    <>
      <p className="muted">{t.memberPages.scheduleHint}</p>
      <AsyncSection state={state}>
        {(events) => (
          <Calendar
            events={events}
            date={date}
            view={view}
            labels={t.calendar}
            onDateChange={(value) => {
              setValues({ date: value });
              setSelected(null);
            }}
            onViewChange={(value) => {
              setView(value);
              setSelected(null);
            }}
            onSelectEvent={(event) =>
              setSelected(events.find((row) => row.id === event.id) ?? null)
            }
          />
        )}
      </AsyncSection>
      {selected && (
        <Drawer
          title={selected.title}
          onClose={() => setSelected(null)}
          size="md"
        >
          <p>
            {formatDateTime(selected.startAtUtc)} –{" "}
            {formatDateTime(selected.endAtUtc)}
          </p>
          <dl className="stack">
            <div>
              <dt>{t.operations.room}</dt>
              <dd>{selected.roomName || "—"}</dd>
            </div>
            {selected.coachName && (
              <div>
                <dt>{t.operations.coach}</dt>
                <dd>{selected.coachName}</dd>
              </div>
            )}
            <div>
              <dt>{t.operations.status}</dt>
              <dd>
                <StatusChip value={selected.status} />
              </dd>
            </div>
            {selected.type === "CLASS_SESSION" && (
              <div>
                <dt>{t.operations.attendance}</dt>
                <dd>
                  <StatusChip value={selected.attendanceStatus} />
                </dd>
              </div>
            )}
            {selected.quotaState && (
              <div>
                <dt>{t.memberPages.quota}</dt>
                <dd>
                  <StatusChip value={selected.quotaState} />
                </dd>
              </div>
            )}
          </dl>
          {selected.isMakeup && <p>{t.memberPages.makeup}</p>}
          <Link
            href={
              selected.classId
                ? `/member/courses/${selected.classId}`
                : "/member/training"
            }
          >
            {t.refactor.details}
          </Link>
        </Drawer>
      )}
    </>
  );
}
