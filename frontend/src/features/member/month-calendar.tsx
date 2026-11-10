"use client";

import { useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/language";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import type { EventKind } from "./event-meta";
import styles from "./month-calendar.module.css";
import { CalendarSticker } from "./calendar-sticker";
import { BookOpen, MapPin } from "lucide-react";
import { Dialog } from "@/components/ui";

type MonthEvent = {
  id: string;
  title: string;
  kind: EventKind;
  startAtUtc: string;
  endAtUtc: string;
  status?: string | null;
  preview?: boolean;
  fading?: boolean;
  attendanceStatus?: string | null;
  sport?: string | null;
};

export function MemberMonthCalendar<T extends MonthEvent>({
  month,
  columns,
  weekdays,
  kindLabels,
  onSelect,
  renderEvent,
}: {
  month: string;
  columns: [string, T[]][];
  weekdays: string[];
  kindLabels: Record<EventKind, string>;
  onSelect: (event: T) => void;
  renderEvent: (event: T, onActivate?: () => void) => ReactNode;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const today = todayIso();
  const todayWeekdayIndex =
    (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const isTodayInView = columns.some(([day]) => day === today);
  const [chosenDay, setChosenDay] = useState(
    today.startsWith(month) ? today : `${month}-01`,
  );
  const [showAgenda, setShowAgenda] = useState(false);
  const selectedEvents = columns.find(([day]) => day === chosenDay)?.[1] ?? [];
  const weeksWithEvents = Array.from(
    { length: Math.ceil(columns.length / 7) },
    (_, index) =>
      columns
        .slice(index * 7, index * 7 + 7)
        .some(([, events]) => events.length > 0),
  );
  function chooseDay(day: string) {
    setChosenDay(day);
    setShowAgenda(true);
  }
  return (
    <div className={styles.calendar}>
      <div
        className={styles.legend}
        aria-label={vi ? "Loại hoạt động" : "Event types"}
      >
        {(["class", "rental"] as const).map((kind) => {
          const Icon = kind === "rental" ? MapPin : BookOpen;
          return (
            <span key={kind} data-kind={kind}>
              <i aria-hidden="true" />
              <Icon size={14} aria-hidden="true" />
              {kindLabels[kind]}
            </span>
          );
        })}
        <span className={styles.timezone}>
          {vi ? "Giờ Việt Nam · GMT+7" : "Vietnam time · GMT+7"}
        </span>
      </div>
      <div className={styles.surface}>
        <div className={styles.weekdays} aria-hidden="true">
          {weekdays.map((day, index) => {
            const isToday = isTodayInView && index === todayWeekdayIndex;
            return (
              <span
                key={day}
                data-today={isToday ? "true" : undefined}
                className={isToday ? styles.todayWeekday : undefined}
                title={isToday ? (vi ? "Hôm nay" : "Today") : undefined}
              >
                {day}
              </span>
            );
          })}
        </div>
        <div
          className={styles.grid}
          role="group"
          aria-label={vi ? "Lịch tháng" : "Month calendar"}
          style={{
            gridTemplateRows: weeksWithEvents
              .map((hasEvents) =>
                hasEvents
                  ? "minmax(var(--scheduled-week-height), auto)"
                  : "minmax(var(--empty-week-height), auto)",
              )
              .join(" "),
          }}
        >
          {columns.map(([day, events], index) => (
            <section
              key={day}
              className={styles.day}
              data-today={day === today ? "true" : undefined}
              data-outside={!day.startsWith(month)}
              data-selected={day === chosenDay}
              data-empty-week={!weeksWithEvents[Math.floor(index / 7)]}
              aria-label={formatDate(day)}
            >
              <button
                type="button"
                className={styles.date}
                aria-label={`${formatDate(day)}, ${events.length} ${vi ? "hoạt động" : "events"}`}
                aria-current={day === today ? "date" : undefined}
                aria-pressed={day === chosenDay}
                onClick={() => chooseDay(day)}
              >
                {Number(day.slice(-2)) === 1
                  ? `${Number(day.slice(-2))}/${Number(day.slice(5, 7))}`
                  : Number(day.slice(-2))}
              </button>
              <div className={styles.events}>
                {events.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.event}
                    data-kind={event.kind}
                    data-preview={!!event.preview}
                    data-cancelled={/CANCEL/i.test(event.status ?? "")}
                    data-fading={event.fading ? "true" : undefined}
                    title={`${kindLabels[event.kind]} · ${event.sport ?? ""} · ${formatTime(event.startAtUtc)}–${formatTime(event.endAtUtc)} · ${event.title}`}
                    data-state={
                      event.attendanceStatus?.toUpperCase() === "ABSENT"
                        ? "absent"
                        : event.attendanceStatus?.toUpperCase() === "PRESENT" ||
                            event.status?.toUpperCase() === "COMPLETED"
                          ? "completed"
                          : undefined
                    }
                    onClick={() => {
                      setChosenDay(day);
                      onSelect(event);
                    }}
                  >
                    <CalendarSticker sport={event.sport} kind={event.kind} />
                    <time dateTime={event.startAtUtc}>
                      {formatTime(event.startAtUtc)}–
                      {formatTime(event.endAtUtc)}
                    </time>
                    <span>{event.title}</span>
                    {/CANCEL/i.test(event.status ?? "") && <b>Cancelled</b>}
                    {event.attendanceStatus?.toUpperCase() === "ABSENT" ? (
                      <b>{vi ? "Vắng" : "Absent"}</b>
                    ) : event.attendanceStatus?.toUpperCase() === "PRESENT" ||
                      event.status?.toUpperCase() === "COMPLETED" ? (
                      <b>{vi ? "Hoàn thành" : "Completed"}</b>
                    ) : null}
                  </button>
                ))}
                {events.length > 3 && (
                  <button
                    type="button"
                    className={styles.more}
                    onClick={() => chooseDay(day)}
                  >
                    +{events.length - 3} {vi ? "hoạt động khác" : "more"}
                  </button>
                )}
              </div>
              <button
                type="button"
                className={styles.mobileEvents}
                onClick={() => chooseDay(day)}
                aria-label={`${formatDate(day)}, ${events.length} ${vi ? "hoạt động" : "events"}`}
              >
                <span className={styles.dots} aria-hidden="true">
                  {events.slice(0, 1).map((event) => (
                    <CalendarSticker
                      key={event.id}
                      sport={event.sport}
                      kind={event.kind}
                    />
                  ))}
                </span>
                {events.length > 0 && <span>{events.length}</span>}
              </button>
            </section>
          ))}
        </div>
      </div>
      {showAgenda && (
        <Dialog
          title={new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${chosenDay}T12:00:00Z`))}
          onClose={() => setShowAgenda(false)}
          closeIconOnly
        >
          <section
            className={styles.agenda}
            aria-label={vi ? "Hoạt động trong ngày" : "Day agenda"}
          >
            <p>
              {selectedEvents.length} {vi ? "hoạt động" : "events"}
            </p>
            {selectedEvents.length ? (
              <ul>
                {selectedEvents.map((event) => (
                  <li key={event.id} data-kind={event.kind}>
                    {renderEvent(event, () => setShowAgenda(false))}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {vi
                  ? "Bạn chưa có lịch trong ngày này."
                  : "No activities scheduled for this day."}
              </p>
            )}
          </section>
        </Dialog>
      )}
    </div>
  );
}
