"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Search,
  Users,
  BookOpen,
} from "lucide-react";
import { StatusChip } from "@/components/ui";
import { CourseSticker } from "@/features/courses";
import { formatDate, formatDateTime } from "@/lib/format";
import { useNow } from "@/lib/useApi";
import type { CourseDto, CourseSessionDto } from "@/lib/types";
import { classSportTone } from "./class-identity";
import styles from "./class-directory.module.css";

const order: Record<string, number> = {
  IN_PROGRESS: 0,
  PUBLISHED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

export function ClassDirectory({
  classes,
  sessions,
}: {
  classes: CourseDto[];
  sessions: CourseSessionDto[];
}) {
  const [search, setSearch] = useState("");
  const now = useNow();
  const term = search.trim().toLowerCase();
  const visible = classes
    .filter((course) =>
      `${course.name} ${course.code} ${course.sportName}`
        .toLowerCase()
        .includes(term),
    )
    .sort(
      (a, b) =>
        (order[a.status] ?? 4) - (order[b.status] ?? 4) ||
        a.name.localeCompare(b.name),
    );
  return (
    <section className={styles.directory} aria-label="Your assigned classes">
      <div className={styles.toolbar}>
        <p>
          <strong>{classes.length}</strong> assigned{" "}
          {classes.length === 1 ? "class" : "classes"}
          <span>Active classes first</span>
        </p>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search class, code or sport"
            aria-label="Search classes"
          />
        </label>
      </div>
      <div className={styles.grid}>
        {visible.map((course) => {
          const next = sessions
            .filter(
              (session) =>
                session.classId === course.classId &&
                session.status === "SCHEDULED" &&
                Date.parse(session.endAtUtc) > now,
            )
            .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc))[0];
          return (
            <Link
              key={course.classId}
              href={`/coach/classes/${course.classId}`}
              className={styles.card}
              data-sport={classSportTone(course.sportName)}
            >
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.sport}>{course.sportName}</span>
                  <span className={styles.code}>{course.code}</span>
                </div>
                <StatusChip value={course.status} />
              </div>
              <div className={styles.identity}>
                <h3>{course.name}</h3>
                <div className={styles.sticker} aria-hidden="true">
                  <CourseSticker sport={course.sportName} compact small />
                </div>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>
                    <MapPin size={16} aria-hidden="true" />
                    Court / room
                  </dt>
                  <dd>{course.roomName || "Not assigned"}</dd>
                </div>
                <div>
                  <dt>
                    <Users size={16} aria-hidden="true" />
                    Capacity
                  </dt>
                  <dd>{course.capacity} students</dd>
                </div>
                <div>
                  <dt>
                    <BookOpen size={16} aria-hidden="true" />
                    Course
                  </dt>
                  <dd>{course.numSessions} sessions</dd>
                </div>
              </dl>
              <div className={styles.nextSession}>
                <CalendarDays size={18} aria-hidden="true" />
                <div>
                  <span>
                    {next
                      ? Date.parse(next.startAtUtc) <= now
                        ? "Current lesson"
                        : "Your next lesson"
                      : "Start date"}
                  </span>
                  <strong>
                    {next
                      ? formatDateTime(next.startAtUtc)
                      : formatDate(course.startDate)}
                  </strong>
                  {next && (
                    <small>
                      Session {next.sessionNo} ·{" "}
                      {next.roomName || "Room not assigned"}
                    </small>
                  )}
                </div>
              </div>
              <div className={styles.cardFooter}>
                <span>Students · Plans · Notices</span>
                <strong>
                  Open class <ArrowUpRight size={18} aria-hidden="true" />
                </strong>
              </div>
            </Link>
          );
        })}
      </div>
      {!visible.length && (
        <p className={styles.empty} role="status">
          No matching classes. Try a class name, code or sport.
        </p>
      )}
    </section>
  );
}
