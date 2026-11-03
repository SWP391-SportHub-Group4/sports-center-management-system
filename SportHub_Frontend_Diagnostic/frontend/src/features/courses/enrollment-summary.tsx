"use client";

import type { ManagerCourseDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import styles from "./course-detail.module.css";

export function EnrollmentSummary({ course }: { course: ManagerCourseDto }) {
  const { t } = useLanguage();
  const capacity = Math.max(0, course.capacity);
  const segments = [
    {
      label: t.classWorkspace.enrolledLabel,
      count: course.confirmedCount,
      tone: "enrolled",
    },
    { label: t.operations.held, count: course.activeHoldCount, tone: "held" },
    {
      label: t.operations.availableSeats,
      count: course.availableSeats,
      tone: "available",
    },
  ];
  let offset = 0;
  return (
    <figure
      className={styles.seatSummary}
      aria-label={t.classWorkspace.seatSummary}
    >
      <div className={styles.donut}>
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="65" className={styles.track} />
          {segments.map((segment) => {
            const share =
              capacity > 0
                ? Math.min(
                    (Math.max(segment.count, 0) / capacity) * 100,
                    100 - offset,
                  )
                : 0;
            const start = offset;
            offset += share;
            return (
              <circle
                key={segment.tone}
                cx="80"
                cy="80"
                r="65"
                pathLength="100"
                className={styles[segment.tone]}
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={-start}
              />
            );
          })}
        </svg>
        <div className={styles.donutLabel}>
          <strong>
            {course.confirmedCount}
            <span>/{capacity}</span>
          </strong>
          <span>{t.classWorkspace.enrolledLabel}</span>
        </div>
      </div>
      <figcaption>
        <h3>{t.classWorkspace.seatSummary}</h3>
        <dl className={styles.legend}>
          {segments.map((segment) => (
            <div key={segment.tone}>
              <dt>
                <span className={`${styles.swatch} ${styles[segment.tone]}`} />
                {segment.label}
              </dt>
              <dd>{segment.count}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
