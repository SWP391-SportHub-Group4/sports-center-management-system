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
import { ServiceCover, useCoachClassGalleries } from "@/features/service-media";
import { formatDate, formatDateTime } from "@/lib/format";
import { useNow } from "@/lib/useApi";
import { sortTeachingClasses } from "@/lib/teaching-order";
import type { CourseDto, CourseSessionDto } from "@/lib/types";
import { classSportTone } from "./class-identity";
import styles from "./class-directory.module.css";

export function ClassDirectory({
  classes,
  sessions,
}: {
  classes: CourseDto[];
  sessions: CourseSessionDto[];
}) {
  const [search, setSearch] = useState("");
  const photos = useCoachClassGalleries(
    classes.map((course) => course.classId),
  );
  const now = useNow();
  const term = search.trim().toLowerCase();
  const visible = sortTeachingClasses(classes, sessions, now).filter((course) =>
    `${course.name} ${course.code} ${course.sportName}`
      .toLowerCase()
      .includes(term),
  );
  return (
    <section className={styles.directory} aria-label="Your assigned classes">
      <div className={styles.toolbar}>
        <p>
          <strong>{classes.length}</strong> assigned{" "}
          {classes.length === 1 ? "class" : "classes"}
          <span>Upcoming classes first · Past classes below</span>
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
      {photos.error && (
        <p className={styles.photoNotice} role="status">
          Class photos are temporarily unavailable.{" "}
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={photos.reload}
          >
            Try again
          </button>
        </p>
      )}
      <div className={styles.grid}>
        {visible.map((course) => {
          const classSessions = sessions.filter(
            (item) =>
              item.classId === course.classId && item.status !== "CANCELLED",
          );
          const completed = classSessions.filter(
            (item) => item.status === "COMPLETED",
          ).length;
          const total = Math.max(course.numSessions ?? 0, classSessions.length);
          const next = sessions
            .filter(
              (session) =>
                session.classId === course.classId &&
                session.coachId === course.coachId &&
                session.status === "SCHEDULED" &&
                Date.parse(session.endAtUtc) > now,
            )
            .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc))[0];
          return (
            <Link
              key={course.classId}
              href={`/coach/classes/${course.classId}`}
              aria-label={`Open class: ${course.name}`}
              className={styles.card}
              data-sport={classSportTone(course.sportName)}
            >
              <ServiceCover
                gallery={photos.galleries.get(course.classId)}
                kind="class"
                sportName={course.sportName}
                alt={course.name}
                className={styles.cover}
              />
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.sport}>{course.sportName}</span>
                  <span className={styles.code}>{course.code}</span>
                </div>
                <StatusChip value={course.status} />
              </div>
              <div className={styles.identity}>
                <h3>{course.name}</h3>
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
                    Starts
                  </dt>
                  <dd>{formatDate(course.startDate)}</dd>
                </div>
              </dl>
              <div className={styles.progressBlock}>
                <div>
                  <span>Lessons completed</span>
                  <strong>
                    {completed} / {total}
                  </strong>
                </div>
                <progress
                  value={completed}
                  max={Math.max(total, 1)}
                  aria-label={`${course.name} lessons completed`}
                />
              </div>
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
                <span>Manage teaching</span>
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
