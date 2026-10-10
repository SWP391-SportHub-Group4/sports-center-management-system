"use client";

import { useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/language";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import type { EventKind } from "./event-meta";
import styles from "./month-calendar.module.css";
import { CalendarSticker } from "./calendar-sticker";
import { BookOpen, MapPin, UserRound } from "lucide-react";

type MonthEvent = {
  id: string;
  title: string;
  kind: EventKind;
  startAtUtc: string;
  endAtUtc: string;
  status?: string | null;
  preview?: boolean;
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
  renderEvent: (event: T) => ReactNode;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const today = todayIso();
  const [chosenDay, setChosenDay] = useState(
    today.startsWith(month) ? today : `${month}-01`,
  );
  const [showAgenda, setShowAgenda] = useState(false);
  const selectedEvents = columns.find(([day]) => day === chosenDay)?.[1] ?? [];
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
        {(["class", "pt", "rental"] as const).map((kind) => {
          const Icon =
            kind === "class"
              ? BookOpen
              : kind === "rental"
                ? MapPin
                : UserRound;
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
          {weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          className={styles.grid}
          role="group"
          aria-label={vi ? "Lịch tháng" : "Month calendar"}
          style={{ "--week-count": columns.length / 7 } as React.CSSProperties}
        >
          {columns.map(([day, events]) => (
            <section
              key={day}
              className={styles.day}
              data-outside={!day.startsWith(month)}
              data-selected={day === chosenDay}
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
                    title={`${kindLabels[event.kind]} · ${event.sport ?? ""} · ${formatTime(event.startAtUtc)}–${formatTime(event.endAtUtc)} · ${event.title}`}
                    onClick={() => onSelect(event)}
                  >
                    <CalendarSticker sport={event.sport} kind={event.kind} />
                    <time dateTime={event.startAtUtc}>
                      {formatTime(event.startAtUtc)}
                    </time>
                    <span>{event.title}</span>
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
      <section
        className={styles.agenda}
        data-expanded={showAgenda}
        aria-label={vi ? "Hoạt động trong ngày" : "Day agenda"}
      >
        <h3>
          {formatDate(chosenDay)}{" "}
          <span>
            {selectedEvents.length} {vi ? "hoạt động" : "events"}
          </span>
        </h3>
        {selectedEvents.length ? (
          <ul>
            {selectedEvents.map((event) => (
              <li key={event.id} data-kind={event.kind}>
                {renderEvent(event)}
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
    </div>
  );
}
