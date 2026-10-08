"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/primitives";
import { StatusChip } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { addDaysIso, formatTime, todayIso } from "@/lib/format";
import { dateToIsoWeek, isoWeekToDate } from "@/lib/iso-week";
import type {
  CalendarEvent,
  CalendarLabels,
  CalendarView,
} from "./calendar.contract";
import styles from "./WeekSchedule.module.css";

const shortDate = (day: string) => `${day.slice(8, 10)}-${day.slice(5, 7)}`;

export function WeekSchedule({
  days,
  byDay,
  labels,
  filters,
  onDateChange,
  onViewChange,
  onSelectEvent,
}: {
  days: string[];
  byDay: Map<string, CalendarEvent[]>;
  labels: CalendarLabels;
  filters?: ReactNode;
  onDateChange: (date: string) => void;
  onViewChange: (view: CalendarView) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const { t } = useLanguage();
  const l = t.weekSchedule;
  const today = todayIso();
  const rowCount = Math.max(
    1,
    ...days.map((day) => byDay.get(day)?.length ?? 0),
  );
  const range = `${shortDate(days[0])} ${l.to} ${shortDate(days[6])}`;
  return (
    <section className={styles.calendar} aria-label={labels.eventDetails}>
      <div className={styles.controls}>
        <div className={styles.toolbar}>
          <label className={styles.weekPicker}>
            {l.chooseWeek}
            <input
              type="week"
              required
              value={dateToIsoWeek(days[0])}
              onChange={(e) => {
                const date = isoWeekToDate(e.target.value);
                if (date) onDateChange(date);
              }}
            />
          </label>
          <div className={styles.navigation}>
            <Button
              variant="secondary"
              onClick={() => onDateChange(addDaysIso(days[0], -7))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {l.previousWeek}
            </Button>
            <Button variant="secondary" onClick={() => onDateChange(today)}>
              {l.currentWeek}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onDateChange(addDaysIso(days[0], 7))}
            >
              {l.nextWeek}
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
          <div
            className={styles.views}
            role="group"
            aria-label={labels.eventDetails}
          >
            {(["day", "week", "list"] as const).map((view) => (
              <Button
                key={view}
                variant="ghost"
                size="sm"
                aria-pressed={view === "week"}
                onClick={() => onViewChange(view)}
              >
                {labels[view]}
              </Button>
            ))}
          </div>
        </div>
        {filters && (
          <details className={styles.filters}>
            <summary>{l.filters}</summary>
            <div className={styles.filterBody}>{filters}</div>
          </details>
        )}
      </div>
      <div className={styles.surface}>
        <h2 className={styles.range}>{range}</h2>
        <div
          className={styles.scroll}
          role="region"
          aria-label={`${labels.week}: ${range}`}
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                {days.map((day, index) => (
                  <th
                    key={day}
                    scope="col"
                    className={day === today ? styles.todayHeader : undefined}
                    aria-current={day === today ? "date" : undefined}
                  >
                    {l.weekdays[index]}{" "}
                    <time dateTime={day}>({shortDate(day)})</time>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, index) => (
                <tr key={index}>
                  {days.map((day) => {
                    const event = byDay.get(day)?.[index];
                    const cancelled =
                      event?.status?.startsWith("CANCEL") ||
                      event?.status === "VOID";
                    const title =
                      event &&
                      (event.type === "PT_SESSION" ||
                      event.type === "COURT_RENTAL"
                        ? (labels.types?.[event.type] ?? event.title)
                        : event.title);
                    return (
                      <td
                        key={day}
                        className={day === today ? styles.todayCell : undefined}
                      >
                        {event ? (
                          <button
                            type="button"
                            className={`${styles.event} ${cancelled ? styles.cancelled : ""}`}
                            onClick={() => onSelectEvent(event)}
                          >
                            <span className={styles.title}>{title}</span>
                            <span className={styles.time}>
                              <time dateTime={event.startAtUtc}>
                                {formatTime(event.startAtUtc)}
                              </time>
                              –
                              <time dateTime={event.endAtUtc}>
                                {formatTime(event.endAtUtc)}
                              </time>
                            </span>
                            {event.roomName && (
                              <span className={styles.meta}>
                                {event.roomName}
                              </span>
                            )}
                            {event.coachName && (
                              <span className={styles.meta}>
                                {event.coachName}
                              </span>
                            )}
                            {event.status && (
                              <span>
                                <StatusChip
                                  value={event.status}
                                  label={event.statusLabel}
                                />
                              </span>
                            )}
                          </button>
                        ) : (
                          <span
                            className={styles.empty}
                            aria-label={labels.empty}
                          >
                            –
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
