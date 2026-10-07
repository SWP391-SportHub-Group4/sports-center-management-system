"use client";

import { Button } from "@/components/primitives";
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
  onDateChange,
  onViewChange,
  onSelectEvent,
}: {
  events: CalendarEvent[];
  date: string;
  view: CalendarView;
  labels: CalendarLabels;
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
          <Button variant="quiet" size="sm" onClick={() => move(-1)}>
            {labels.previous}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDateChange(todayIso())}
          >
            {labels.today}
          </Button>

          <Button variant="quiet" size="sm" onClick={() => move(1)}>
            {labels.next}
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <div className={styles.list}>
          {days.map((day) => {
            const items = byDay.get(day) ?? [];

            return (
              <section className={styles.listDay} key={day}>
                <h3 className={styles.listDayTitle}>
                  <time dateTime={day}>{formatDate(day)}</time>
                </h3>

                {!items.length && (
                  <p className={styles.empty}>{labels.empty}</p>
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

                    <span>
                      {labels.types && (
                        <span className={styles.eventType}>
                          {labels.types[event.type] ?? event.type}
                        </span>
                      )}
                      <span className={styles.eventTitle}>{event.title}</span>

                      <span className={styles.eventMeta}>
                        {event.roomName && <span>{event.roomName}</span>}

                        {event.coachName && <span>{event.coachName}</span>}

                        {event.status && <StatusChip value={event.status} />}
                      </span>
                    </span>
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

                      {event.status && <StatusChip value={event.status} />}
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
