"use client";

import { formatDate, formatNumber } from "@/lib/format";
import type { RecordedAttendanceReport } from "./api";
import styles from "./manager-overview.module.css";

export function RecordedAttendance({
  report,
  selectedDate,
  onSelect,
}: {
  report: RecordedAttendanceReport;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const rows = report.daily;
  if (!rows.length)
    return (
      <p className={styles.note}>No recorded attendance for this period.</p>
    );
  const found = rows.findIndex((row) => row.date.slice(0, 10) === selectedDate);
  const index = found < 0 ? rows.length - 1 : found;
  const selected = rows[index];
  const max = Math.max(
    2,
    Math.ceil(Math.max(0, ...rows.map((row) => row.uniqueMembers)) / 2) * 2,
  );
  const x = (i: number) =>
    rows.length === 1 ? 500 : 12 + (i / (rows.length - 1)) * 976;
  const y = (value: number) => 80 - (value / max) * 68;
  const barWidth = Math.min(24, (976 / rows.length) * 0.65);
  const selectAt = (element: HTMLElement, clientX: number) => {
    const bounds = element.getBoundingClientRect();
    const i = Math.max(
      0,
      Math.min(
        rows.length - 1,
        Math.round(
          ((((clientX - bounds.left) / bounds.width) * 1000 - 12) / 976) *
            (rows.length - 1),
        ),
      ),
    );
    onSelect(rows[i].date.slice(0, 10));
  };
  return (
    <section className={styles.attendance} aria-label="Recorded attendance">
      <header className={styles.attendanceHeader}>
        <h3>Recorded attendance</h3>
        <span>Volume · unique members / day</span>
      </header>
      <div className={styles.plot}>
        <div className={styles.volumeAxis} aria-hidden="true">
          <span>{formatNumber(max)}</span>
          <span>{formatNumber(max / 2)}</span>
          <span>0</span>
        </div>
        <div
          className={`${styles.plotBody} ${styles.attendanceBars}`}
          role="slider"
          tabIndex={0}
          aria-label="Inspect recorded attendance. Use arrow keys to change day."
          aria-valuemin={1}
          aria-valuemax={rows.length}
          aria-valuenow={index + 1}
          aria-valuetext={`${formatDate(selected.date)}: ${selected.uniqueMembers} unique members, ${selected.gymCheckIns} Gym check-ins, ${selected.classAttendances} Present class attendances`}
          onPointerMove={(event) => {
            if (event.pointerType !== "touch" || event.buttons)
              selectAt(event.currentTarget, event.clientX);
          }}
          onPointerDown={(event) =>
            selectAt(event.currentTarget, event.clientX)
          }
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight" || event.key === "ArrowUp"
                ? index + 1
                : event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? index - 1
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? rows.length - 1
                      : null;
            if (next !== null) {
              event.preventDefault();
              onSelect(
                rows[Math.max(0, Math.min(rows.length - 1, next))].date.slice(
                  0,
                  10,
                ),
              );
            }
          }}
        >
          <svg
            viewBox="0 0 1000 88"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[max, max / 2, 0].map((value) => (
              <line
                key={value}
                x1="0"
                x2="1000"
                y1={y(value)}
                y2={y(value)}
                className={styles.gridLine}
              />
            ))}
            <line
              x1={x(index)}
              x2={x(index)}
              y1="0"
              y2="88"
              className={styles.cursor}
            />
            {rows.map((row, i) => (
              <rect
                key={row.date}
                x={x(i) - barWidth / 2}
                y={y(row.uniqueMembers)}
                width={barWidth}
                height={80 - y(row.uniqueMembers)}
                rx="2"
                className={styles.volumeBar}
                data-selected={i === index || undefined}
              />
            ))}
            {selected.uniqueMembers > 0 && (
              <rect
                x={x(index) - barWidth / 2}
                y={y(selected.uniqueMembers)}
                width={barWidth}
                height="2"
                className={styles.volumeCap}
              />
            )}
          </svg>
          <div className={styles.xAxis} aria-hidden="true">
            {Array.from(
              new Set(
                Array.from({ length: 5 }, (_, i) =>
                  Math.round((i * (rows.length - 1)) / 4),
                ),
              ),
            ).map((i) => (
              <span key={i} style={{ left: `${x(i) / 10}%` }}>
                {rows[i].date.slice(8, 10)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.attendanceSummary}>
        <strong>
          {formatNumber(selected.uniqueMembers)} members ·{" "}
          {formatDate(selected.date)}
        </strong>
        <span>
          {formatNumber(selected.gymCheckIns)} Gym check-ins ·{" "}
          {formatNumber(selected.classAttendances)} class attendances
        </span>
      </div>
      <p className={styles.note}>
        Each member counts once per day. Class attendance means Present; rental
        visitors are not tracked. Records may be updated later.
      </p>
    </section>
  );
}
