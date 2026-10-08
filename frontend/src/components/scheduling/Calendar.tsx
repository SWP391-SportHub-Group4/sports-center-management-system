"use client";

import { Button } from "@/components/primitives";
import type { ReactNode } from "react";
import { WeekSchedule } from "./WeekSchedule";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StatusChip } from "@/components/ui";
import { addDaysIso, formatDate, formatTime, todayIso } from "@/lib/format";
import type {
  CalendarEvent,
  CalendarLabels,
  CalendarView,
} from "./calendar.contract";

import styles from "./Calendar.module.css";

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function vietnamDateIso(value: string) {
  return new Date(new Date(value).getTime() + VIETNAM_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function daysFor(view: CalendarView) {
  return view === "day" ? 1 : 7;
}

export function Calendar({
  events,
  date,
  view,
  labels,
  weekTable = false,
  filters,
  onDateChange,
  onViewChange,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  date: string;
  view: CalendarView;
  labels: CalendarLabels;
  weekTable?: boolean;
  filters?: ReactNode;
  onDateChange: (date: string) => void;
  onViewChange: (view: CalendarView) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const rangeDays = daysFor(view);

  const days = Array.from({ length: rangeDays }, (_, index) =>
    addDaysIso(date, index),
  );

  const byDay = new Map<string, CalendarEvent[]>();

  for (const day of days) {
    byDay.set(day, []);
  }

  for (const event of events) {
    const day = vietnamDateIso(event.startAtUtc);

    const bucket = byDay.get(day);

    if (bucket) {
      bucket.push(event);
    }
  }

  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  }

  const move = (direction: -1 | 1) =>
    onDateChange(addDaysIso(date, direction * rangeDays));

  if (weekTable && view === "week")
    return (
      <WeekSchedule
        days={days}
        byDay={byDay}
        labels={labels}
        filters={filters}
        onDateChange={onDateChange}
        onViewChange={onViewChange}
        onSelectEvent={onSelectEvent}
      />
    );

  return (
    <section className={styles.calendar} aria-label={labels.eventDetails}>
      <div className={styles.toolbar}>
        <div
          className={styles.viewGroup}
          role="group"
          aria-label={labels.eventDetails}
        >
          {(["day", "week", "list"] as const).map((item) => (
            <Button
              key={item}
              variant="ghost"
              size="sm"
              className={styles.viewButton}
              aria-pressed={view === item}
              onClick={() => onViewChange(item)}
            >
              {labels[item]}
            </Button>
          ))}
        </div>

        <div className={styles.navGroup}>
          <Button variant="ghost" size="sm" onClick={() => move(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
            {labels.previous}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDateChange(todayIso())}
          >
            {labels.today}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => move(1)}>
            {labels.next}
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <div className={styles.list}>
          {days.map((day) => {
            const items = byDay.get(day) ?? [];

            return (
              <section className={styles.listDay} key={day}>
                <header className={styles.listDayHeader}>
                  <h3 className={styles.listDayTitle}>
                    <time dateTime={day}>{formatDate(day)}</time>
                  </h3>
                  <span className={styles.dayCount}>{items.length}</span>
                </header>

                {!items.length && (
                  <p className={`${styles.empty} ${styles.listEmpty}`}>
                    {labels.empty}
                  </p>
                )}

                {items.map((event) => (
                  <button
                    type="button"
                    className={`${styles.event} ${styles.listEvent}`}
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                  >
                    <span className={styles.listTime}>
                      {formatTime(event.startAtUtc)}–
                      {formatTime(event.endAtUtc)}
                    </span>

                    <span className={styles.listContent}>
                      <span className={styles.eventTitle}>{event.title}</span>
                      {labels.types && (
                        <span className={styles.eventType}>
                          {labels.types[event.type] ?? event.type}
                        </span>
                      )}

                      <span className={styles.eventMeta}>
                        {event.roomName && <span>{event.roomName}</span>}

                        {event.coachName && <span>{event.coachName}</span>}
                      </span>
                    </span>
                    {event.status && (
                      <span className={styles.listStatus}>
                        <StatusChip
                          value={event.status}
                          label={event.statusLabel}
                        />
                      </span>
                    )}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div
          className={`${styles.grid} ${view === "day" ? styles.gridDay : ""}`}
          tabIndex={0}
          aria-label={labels.eventDetails}
        >
          {days.map((day) => {
            const items = byDay.get(day) ?? [];

            return (
              <section className={styles.day} key={day}>
                <header className={styles.dayHeader}>
                  <strong>
                    <time dateTime={day}>{formatDate(day)}</time>
                  </strong>

                  <span className="small muted">{items.length}</span>
                </header>

                <div className={styles.dayBody}>
                  {!items.length && (
                    <p className={styles.empty}>{labels.empty}</p>
                  )}

                  {items.map((event) => (
                    <button
                      type="button"
                      className={styles.event}
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                    >
                      {labels.types && (
                        <span className={styles.eventType}>
                          {labels.types[event.type] ?? event.type}
                        </span>
                      )}
                      <span className={styles.eventTitle}>{event.title}</span>

                      <span className={styles.eventMeta}>
                        <span>
                          {formatTime(event.startAtUtc)}–
                          {formatTime(event.endAtUtc)}
                        </span>

                        {event.roomName && <span>{event.roomName}</span>}

                        {event.coachName && <span>{event.coachName}</span>}
                      </span>

                      {event.status && (
                        <StatusChip
                          value={event.status}
                          label={event.statusLabel}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
