"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayIso } from "@/lib/format";
import type { SessionPhase } from "./attendance-window";
import styles from "./AttendanceHub.module.css";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const pad = (value: number) => String(value).padStart(2, "0");
export type AttendanceMarker = { count: number; phases: SessionPhase[] };

/** First day (YYYY-MM-01) of the month a date belongs to. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(firstOfMonth: string): string {
  const [year, month] = firstOfMonth.split("-").map(Number);
  return `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}

export function shiftMonth(firstOfMonth: string, delta: number): string {
  const [year, month] = firstOfMonth.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`;
}

/** Month calendar with color coded dots for the sessions on each day. */
export function AttendanceCalendar({
  value,
  month,
  markers,
  disabled,
  onSelect,
  onMonthChange,
}: {
  value: string;
  month: string;
  markers: Map<string, AttendanceMarker>;
  disabled?: boolean;
  onSelect: (iso: string) => void;
  onMonthChange: (firstOfMonth: string) => void;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const leading =
    (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const total = Number(monthEnd(month).slice(8));
  const today = todayIso();
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: total },
      (_, index) => `${year}-${pad(monthNumber)}-${pad(index + 1)}`,
    ),
  ];

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHead}>
        <button
          type="button"
          className={styles.calendarNav}
          aria-label="Tháng trước"
          disabled={disabled}
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong>
          Tháng {monthNumber}/{year}
        </strong>
        <button
          type="button"
          className={styles.calendarNav}
          aria-label="Tháng sau"
          disabled={disabled}
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.calendarGrid} role="group" aria-label="Chọn ngày">
        {WEEKDAYS.map((day) => (
          <span key={day} className={styles.weekday}>
            {day}
          </span>
        ))}
        {cells.map((iso, index) =>
          iso ? (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              className={`${styles.day} ${iso === value ? styles.daySelected : ""} ${iso === today ? styles.dayToday : ""}`}
              aria-pressed={iso === value}
              aria-label={`${Number(iso.slice(8))}/${monthNumber}/${year}${markers.get(iso) ? `, ${markers.get(iso)?.count} sessions` : ""}`}
              onClick={() => onSelect(iso)}
            >
              {Number(iso.slice(8))}
              {markers.get(iso) ? (
                <span className={styles.dayDots} aria-hidden="true">
                  {markers.get(iso)?.phases.map((phase) => (
                    <span
                      key={phase}
                      className={`${styles.dayDot} ${styles[`dot_${phase}`]}`}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          ) : (
            <span key={`blank-${index}`} aria-hidden="true" />
          ),
        )}
      </div>
      <div className={styles.legend} aria-label="Calendar status legend">
        {(["upcoming", "live", "editable", "locked"] as const).map((phase) => (
          <span key={phase} className={styles.calendarLegend}>
            <span
              className={`${styles.dayDot} ${styles[`dot_${phase}`]}`}
              aria-hidden="true"
            />
            {
              {
                upcoming: "Not open",
                live: "Open",
                editable: "Correction open",
                locked: "Locked",
              }[phase]
            }
          </span>
        ))}
        <span className={styles.calendarLegend}>No dot: no class</span>
      </div>
    </div>
  );
}
