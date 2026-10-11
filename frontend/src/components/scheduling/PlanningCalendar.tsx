"use client";

import { useState, type CSSProperties } from "react";
import { Dialog } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { addDaysIso, formatTime, todayIso } from "@/lib/format";
import { useNow } from "@/lib/useApi";
import type { CalendarEvent } from "./calendar.contract";
import styles from "./PlanningCalendar.module.css";

export type PlanningView = "day" | "week" | "month" | "list";
export function planningRange(date: string, view: PlanningView) {
  const monday = (day: string) =>
    addDaysIso(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
  if (view === "month") {
    const first = `${date.slice(0, 7)}-01`;
    const start = monday(first);
    const next = new Date(`${first}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const count =
      Math.ceil(
        Math.round((+next - +new Date(`${start}T12:00:00Z`)) / 86400000) / 7,
      ) * 7;
    return { start, days: count };
  }
  return {
    start: view === "day" ? date : monday(date),
    days: view === "day" ? 1 : 7,
  };
}
const minuteAt = (value: string, day: string) =>
  (+new Date(value) - +new Date(`${day}T00:00:00+07:00`)) / 60000;

export function PlanningCalendar({
  events,
  date,
  view,
  onDateChange,
  onViewChange,
  onSelectEvent,
  dayPopup = false,
}: {
  events: CalendarEvent[];
  date: string;
  view: PlanningView;
  onDateChange: (date: string) => void;
  onViewChange: (view: PlanningView) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  dayPopup?: boolean;
}) {
  const { language } = useLanguage();
  const now = useNow();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const vi = language === "vi";
  const locale = vi ? "vi-VN" : "en-GB";
  const range = planningRange(date, view);
  const days = Array.from({ length: range.days }, (_, i) =>
    addDaysIso(range.start, i),
  );
  const today = todayIso();
  const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
      new Date(`${day}T12:00:00Z`),
    );
  const itemsFor = (day: string) =>
    events
      .filter(
        (e) =>
          minuteAt(e.endAtUtc, day) > 0 && minuteAt(e.startAtUtc, day) < 1440,
      )
      .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  const typeName = (e: CalendarEvent) =>
    e.type === "PT_SESSION" ? "PT" : vi ? "Lớp nhóm" : "Group class";
  const eventState = (e: CalendarEvent) => {
    if (/CANCELLED|RESCHEDULED/.test(e.status ?? "")) return "cancelled";
    if (e.status === "COMPLETED") return "completed";
    if (e.status === "NO_SHOW") return "absent";
    if (new Date(e.endAtUtc).getTime() <= now) return "pending";
    if (minuteAt(e.endAtUtc, today) > 0 && minuteAt(e.startAtUtc, today) < 1440)
      return "today";
    return "future";
  };
  const stateLabels = {
    completed: vi ? "Đã hoàn thành" : "Completed",
    today: vi ? "Hôm nay" : "Today",
    future: vi ? "Sắp tới" : "Upcoming",
    pending: vi ? "Chưa điểm danh" : "Attendance pending",
    absent: "Absent",
    cancelled: vi ? "Đã hủy / dời" : "Cancelled / moved",
  };
  const title =
    view === "month"
      ? dayLabel(date, { month: "long", year: "numeric" })
      : view === "day"
        ? dayLabel(date, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : `${dayLabel(range.start, { day: "numeric", month: "short" })} – ${dayLabel(days.at(-1)!, { day: "numeric", month: "short", year: "numeric" })}`;
  function move(direction: number) {
    if (view !== "month")
      return onDateChange(addDaysIso(date, direction * range.days));
    const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + direction);
    onDateChange(next.toISOString().slice(0, 10));
  }
  function eventButton(
    e: CalendarEvent,
    style?: CSSProperties,
    compact = false,
  ) {
    const state = eventState(e);
    const label = stateLabels[state];
    return (
      <button
        type="button"
        key={e.id}
        className={styles.event}
        data-type={e.type}
        data-state={state}
        data-cancelled={/CANCELLED|RESCHEDULED/.test(e.status ?? "")}
        style={style}
        onClick={() => onSelectEvent(e)}
        title={`${label} · ${typeName(e)} · ${e.title} · ${formatTime(e.startAtUtc)}–${formatTime(e.endAtUtc)}${e.roomName ? ` · ${e.roomName}` : ""}`}
        aria-label={`${label} · ${typeName(e)} · ${e.title} · ${formatTime(e.startAtUtc)}–${formatTime(e.endAtUtc)}`}
      >
        <span className={styles.eventState}>
          {state === "completed" ? "✓ " : state === "absent" ? "× " : ""}
          {label} · {typeName(e)}
        </span>
        <strong>
          {compact ? `${formatTime(e.startAtUtc)} ` : ""}
          {e.title}
        </strong>
        {!compact && (
          <>
            <span>
              {formatTime(e.startAtUtc)}–{formatTime(e.endAtUtc)} ·{" "}
              {typeName(e)}
            </span>
            {e.roomName && <span>{e.roomName}</span>}
          </>
        )}
      </button>
    );
  }
  const visible = events.filter(
    (e) =>
      minuteAt(e.endAtUtc, range.start) > 0 &&
      minuteAt(e.startAtUtc, addDaysIso(range.start, range.days)) < 0,
  );
  const segments = days.flatMap((day) =>
    visible
      .map((e) => ({
        start: Math.max(0, minuteAt(e.startAtUtc, day)),
        end: Math.min(1440, minuteAt(e.endAtUtc, day)),
      }))
      .filter((entry) => entry.end > entry.start),
  );
  const startHour = Math.min(
    6,
    ...segments.map((entry) => Math.floor(entry.start / 60)),
  );
  const endHour = Math.max(
    22,
    ...segments.map((entry) => Math.ceil(entry.end / 60)),
  );
  const currentMinute = minuteAt(new Date(now).toISOString(), today);
  const hourHeight = 52;
  const gridHeight = (endHour - startHour) * hourHeight;
  return (
    <section
      className={styles.calendar}
      aria-label={vi ? "Lịch huấn luyện" : "Training calendar"}
    >
      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <button
            className="btn btn--secondary"
            onClick={() => onDateChange(today)}
          >
            {vi ? "Hôm nay" : "Today"}
          </button>
          <button
            className="btn btn--ghost"
            aria-label={vi ? "Khoảng trước" : "Previous period"}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="btn btn--ghost"
            aria-label={vi ? "Khoảng sau" : "Next period"}
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
          <h2>{title}</h2>
        </div>
        <div className={styles.controls}>
          <label>
            <span className="sr-only">{vi ? "Đến ngày" : "Go to date"}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) onDateChange(e.target.value);
              }}
            />
          </label>
          {!dayPopup && (
            <label>
              <span className="sr-only">
                {vi ? "Chế độ xem lịch" : "Calendar view"}
              </span>
              <select
                value={view}
                onChange={(e) => onViewChange(e.target.value as PlanningView)}
              >
                <option value="day">{vi ? "Ngày" : "Day"}</option>
                <option value="week">{vi ? "Tuần" : "Week"}</option>
                <option value="month">{vi ? "Tháng" : "Month"}</option>
                <option value="list">{vi ? "Lịch trình" : "Agenda"}</option>
              </select>
            </label>
          )}
        </div>
      </div>
      <div className={styles.legend}>
        {(Object.keys(stateLabels) as (keyof typeof stateLabels)[])
          .filter(
            (state) =>
              ["completed", "today", "future"].includes(state) ||
              events.some((e) => eventState(e) === state),
          )
          .map((state) => (
            <span key={state} data-state={state}>
              <i />
              {stateLabels[state]}
            </span>
          ))}
        <span>{vi ? "Giờ Việt Nam · GMT+7" : "Vietnam time · GMT+7"}</span>
      </div>
      {view === "month" ? (
        <div className={styles.scroll}>
          <div className={styles.month}>
            {days.slice(0, 7).map((day) => (
              <div className={styles.weekday} key={day}>
                {dayLabel(day, { weekday: "short" })}
              </div>
            ))}
            {days.map((day) => (
              <section
                key={day}
                className={styles.monthDay}
                data-outside={day.slice(0, 7) !== date.slice(0, 7)}
                data-today={day === today}
              >
                <button
                  className={styles.openDay}
                  onClick={() => {
                    setSelectedDay(day);
                  }}
                  aria-label={dayLabel(day, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                >
                  <span className={styles.date} data-today={day === today}>
                    {Number(day.slice(-2))}
                  </span>
                </button>
                {itemsFor(day).map((e) => eventButton(e, undefined, true))}
              </section>
            ))}
          </div>
        </div>
      ) : view === "list" ? (
        <div className={styles.agenda}>
          {days.map((day) => (
            <section key={day}>
              <h3>
                {dayLabel(day, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </h3>
              {itemsFor(day).length ? (
                itemsFor(day).map((e) => eventButton(e))
              ) : (
                <p className="muted">
                  {vi ? "Chưa có buổi tập." : "No sessions."}
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div
          className={styles.scroll}
          tabIndex={0}
          aria-label={
            vi
              ? "Lưới thời gian, cuộn để xem các giờ"
              : "Time grid, scroll to see all hours"
          }
        >
          <div
            className={`${styles.timeGrid} ${view === "day" ? styles.singleDay : ""}`}
            style={{ "--days": days.length } as CSSProperties}
          >
            <div className={styles.corner}>GMT+7</div>
            {days.map((day) => (
              <header className={styles.dayHeader} key={day}>
                <span>{dayLabel(day, { weekday: "short" })}</span>
                <button
                  className={styles.date}
                  data-today={day === today}
                  onClick={() => {
                    onDateChange(day);
                    onViewChange("day");
                  }}
                >
                  {Number(day.slice(-2))}
                </button>
              </header>
            ))}
            <div className={styles.hours} style={{ height: gridHeight }}>
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <span key={i} style={{ top: i * hourHeight }}>
                  {String(startHour + i).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((day) => {
              const items = itemsFor(day);
              const entries = items.map((e) => ({
                e,
                start: Math.max(startHour * 60, minuteAt(e.startAtUtc, day)),
                end: Math.min(endHour * 60, minuteAt(e.endAtUtc, day)),
                column: 0,
                columns: 1,
              }));
              let group: typeof entries = [];
              let groupEnd = -1;
              function finalize() {
                const ends: number[] = [];
                for (const entry of group) {
                  let column = ends.findIndex((end) => end <= entry.start);
                  if (column < 0) column = ends.length;
                  ends[column] = Math.max(entry.end, entry.start + 25);
                  entry.column = column;
                }
                for (const entry of group) entry.columns = ends.length;
              }
              for (const entry of entries) {
                if (entry.start >= groupEnd) {
                  finalize();
                  group = [];
                  groupEnd = -1;
                }
                group.push(entry);
                groupEnd = Math.max(groupEnd, entry.end, entry.start + 25);
              }
              finalize();
              return (
                <div
                  className={styles.dayColumn}
                  key={day}
                  data-today={day === today}
                  style={{ height: gridHeight }}
                >
                  {Array.from({ length: endHour - startHour }, (_, i) => (
                    <div
                      className={styles.hourLine}
                      key={i}
                      style={{ top: i * hourHeight }}
                    />
                  ))}
                  {entries.map(({ e, start, end, column, columns }) =>
                    eventButton(e, {
                      position: "absolute",
                      top: (start / 60 - startHour) * hourHeight,
                      height: Math.max(
                        22,
                        ((end - start) / 60) * hourHeight - 2,
                      ),
                      left: `calc(${(column / columns) * 100}% + 2px)`,
                      width: `calc(${100 / columns}% - 4px)`,
                    }),
                  )}
                  {day === today &&
                    currentMinute >= startHour * 60 &&
                    currentMinute < endHour * 60 && (
                      <div
                        className={styles.nowLine}
                        style={{
                          top: (currentMinute / 60 - startHour) * hourHeight,
                        }}
                        aria-label={vi ? "Thời gian hiện tại" : "Current time"}
                      />
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {selectedDay && (
        <Dialog
          title={dayLabel(selectedDay, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          size="lg"
          onClose={() => setSelectedDay(null)}
        >
          <PlanningCalendar
            dayPopup
            events={events}
            date={selectedDay}
            view="day"
            onDateChange={(value) => {
              setSelectedDay(value);
              onDateChange(value);
            }}
            onViewChange={() => {}}
            onSelectEvent={(event) => {
              setSelectedDay(null);
              onSelectEvent(event);
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
