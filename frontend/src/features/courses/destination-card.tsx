"use client";
import Link from "next/link";
import { useMemo } from "react";
import { formatMoney } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import type { CourseDto } from "@/lib/types";
import { previewSessions } from "./preview";
import { thresholdCopy } from "./threshold-copy";
import styles from "./destination-card.module.css";

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const DATE = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
const TIME = { hour: "2-digit", minute: "2-digit" } as const;
const SESSION = {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  ...TIME,
} as const;

/** Lớp đích của luồng chuyển lớp: lịch học hiện ngay tại chỗ, không buộc người dùng rời trang. */
export function DestinationCard({ course }: { course: CourseDto }) {
  const { language } = useLanguage();
  const l = thresholdCopy[language];
  const locale = language === "vi" ? "vi-VN" : "en-GB";
  const fmt = (value: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, ...opts }).format(
      new Date(value),
    );
  const sessions = useMemo(
    () =>
      previewSessions(
        {
          startDate: course.startDate,
          numSessions: course.numSessions,
          scheduleRules: course.scheduleRules,
        },
        60,
      ),
    [course.startDate, course.numSessions, course.scheduleRules],
  );
  // Mẫu lặp lấy từ các buổi thực tế nên không phụ thuộc quy ước đánh số thứ.
  const pattern = useMemo(() => {
    const f = (value: string, opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, ...opts }).format(
        new Date(value),
      );
    const byTime = new Map<string, string[]>();
    for (const s of sessions.slice(0, 14)) {
      const time = f(s.startAtUtc, TIME);
      const day = f(s.startAtUtc, { weekday: "short" });
      const list = byTime.get(time) ?? [];
      if (!list.includes(day)) list.push(day);
      byTime.set(time, list);
    }
    return [...byTime.entries()]
      .map(([time, days]) => `${days.join(", ")} · ${time}`)
      .join(" | ");
  }, [sessions, locale]);
  const first = sessions[0];
  const last = sessions[sessions.length - 1];

  return (
    <section className={styles.card} aria-label={course.name}>
      <header className={styles.head}>
        <div>
          <h3>{course.name}</h3>
          <p>
            {l.coach}: {course.coachName ?? "—"}
            {course.roomName ? ` · ${course.roomName}` : ""}
          </p>
        </div>
        <span className={styles.seats} data-few={course.availableSeats <= 3}>
          {l.seats}: {course.availableSeats}
        </span>
      </header>

      <div className={styles.schedule}>
        <p className={styles.label}>{l.schedule}</p>
        {first ? (
          <>
            <p className={styles.pattern}>{pattern}</p>
            <p className={styles.range}>
              {l.sessionsCount.replace("{n}", String(sessions.length))} ·{" "}
              {l.startsOn} {fmt(first.startAtUtc, DATE)}
              {last && last !== first
                ? ` · ${l.endsOn} ${fmt(last.startAtUtc, DATE)}`
                : ""}
            </p>
            <details className={styles.all}>
              <summary>
                {l.viewSessions.replace("{n}", String(sessions.length))}
              </summary>
              <ol>
                {sessions.map((s, i) => (
                  <li key={s.startAtUtc}>
                    <span>{i + 1}</span>
                    <time dateTime={s.startAtUtc}>
                      {fmt(s.startAtUtc, SESSION)}
                    </time>
                  </li>
                ))}
              </ol>
            </details>
          </>
        ) : course.firstSessionStartUtc ? (
          <p className={styles.pattern}>
            {l.firstSession}:{" "}
            {fmt(course.firstSessionStartUtc, { ...DATE, ...TIME })}
          </p>
        ) : (
          <p className={styles.range}>{l.scheduleTbc}</p>
        )}
      </div>

      <footer className={styles.foot}>
        <p className={styles.price}>
          <span>{l.price}</span>
          {formatMoney(course.price)}
        </p>
        <Link
          className="btn btn--quiet btn--sm"
          href={`/courses/${course.classId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {l.classDetails}
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only">{l.newTab}</span>
        </Link>
      </footer>
    </section>
  );
}
