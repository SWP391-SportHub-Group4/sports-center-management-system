"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPin,
  UserRound,
  Users,
} from "lucide-react";
import { AsyncSection, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatTime } from "@/lib/format";
import { courseApi } from "@/features/courses";
import { memberEnrollments } from "./api";
import { CalendarSticker } from "./calendar-sticker";
import styles from "./schedule-course-page.module.css";

export function ScheduleCoursePage({
  classId,
  event,
  onBack,
}: {
  classId: number;
  event?: {
    title: string;
    sport?: string | null;
    coachName?: string | null;
    roomName?: string | null;
    startAtUtc: string;
  };
  onBack: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const sessionDate = (utc: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      ...options,
    }).format(new Date(utc));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const state = useApi(
    async (signal) => {
      const [enrollments, sessions] = await Promise.all([
        memberEnrollments(signal),
        courseApi.sessions(classId, true, signal),
      ]);
      return {
        enrollment: enrollments.find((row) => row.classId === classId),
        sessions: [...sessions].sort((a, b) =>
          a.startAtUtc.localeCompare(b.startAtUtc),
        ),
      };
    },
    [classId],
  );
  const enrollment = state.data?.enrollment;
  const name =
    enrollment?.className ??
    event?.title ??
    (vi ? "Khóa học đã đăng ký" : "Enrolled course");
  const sport = enrollment?.sportName ?? event?.sport;
  const coach = enrollment?.coachName ?? event?.coachName;
  return (
    <div className={styles.viewport}>
      <article className={styles.page} aria-labelledby="schedule-course-title">
        <header className={styles.navigation}>
          <button type="button" className="btn btn--quiet" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            {vi ? "Trở về lịch của tôi" : "Back to my schedule"}
          </button>
          {enrollment && <StatusChip value={enrollment.status} />}
        </header>
        <div className={styles.overview}>
          <figure className={styles.coach}>
            <Image
              src="/sporthub/coaches/minh-khang.webp"
              width={800}
              height={1000}
              alt={
                vi
                  ? "Ảnh minh họa huấn luyện viên tại trung tâm"
                  : "Illustrative portrait of a sports coach"
              }
              priority
            />
            <figcaption>
              <span>{vi ? "Huấn luyện viên" : "Your coach"}</span>
              <strong>
                {coach || (vi ? "Đang phân công" : "To be assigned")}
              </strong>
              <small>{vi ? "Ảnh minh họa" : "Illustrative portrait"}</small>
            </figcaption>
          </figure>
          <div className={styles.summary}>
            <div className={styles.sport}>
              <CalendarSticker kind="class" sport={sport} />
              <span>{sport}</span>
            </div>
            <h2 ref={heading} tabIndex={-1} id="schedule-course-title">
              {name}
            </h2>
            <p>
              {vi
                ? "Thông tin khóa học và các buổi bạn đã đăng ký, ngay trong lịch của bạn."
                : "Your enrolled course and its sessions, right here in your schedule."}
            </p>
            <dl className={styles.facts}>
              <div>
                <dt>
                  <CalendarDays size={17} aria-hidden="true" />
                  {vi ? "Số buổi" : "Sessions"}
                </dt>
                <dd>{enrollment?.numSessions ?? "—"}</dd>
              </div>
              <div>
                <dt>
                  <MapPin size={17} aria-hidden="true" />
                  {vi ? "Sân / phòng" : "Court / room"}
                </dt>
                <dd>{enrollment?.roomName ?? event?.roomName ?? "—"}</dd>
              </div>
              <div>
                <dt>
                  <Users size={17} aria-hidden="true" />
                  {vi ? "Hoàn thành" : "Completed"}
                </dt>
                <dd>
                  {enrollment?.completedSessions ?? "—"}
                  {enrollment ? ` / ${enrollment.numSessions}` : ""}
                </dd>
              </div>
              {event && (
                <div>
                  <dt>
                    <CalendarDays size={17} aria-hidden="true" />
                    {vi ? "Buổi đang xem" : "Selected session"}
                  </dt>
                  <dd>
                    {formatDate(event.startAtUtc)} ·{" "}
                    {formatTime(event.startAtUtc)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        <section
          className={styles.sessions}
          aria-labelledby="schedule-course-sessions"
        >
          <header className={styles.sessionsHeader}>
            <div>
              <h3 id="schedule-course-sessions">
                {vi ? "Lịch học của khóa" : "Course sessions"}
              </h3>
              <p>
                {vi
                  ? "Ngày, giờ và địa điểm của từng buổi học · Giờ Việt Nam (GMT+7)"
                  : "Dates, times and locations · Vietnam time (GMT+7)"}
              </p>
            </div>
            {state.data && (
              <span className={styles.sessionCount}>
                {state.data.sessions.length} {vi ? "buổi học" : "sessions"}
              </span>
            )}
          </header>
          <AsyncSection state={state}>
            {(data) =>
              data.sessions.length ? (
                <ol className={styles.sessionList}>
                  {data.sessions.map((session) => {
                    const selected = session.startAtUtc === event?.startAtUtc;
                    return (
                      <li
                        key={session.sessionId}
                        className={styles.sessionRow}
                        data-selected={selected}
                        aria-current={selected ? "true" : undefined}
                      >
                        <time
                          className={styles.sessionDate}
                          dateTime={session.startAtUtc}
                          aria-label={formatDate(session.startAtUtc)}
                        >
                          <strong>
                            {sessionDate(session.startAtUtc, {
                              day: "2-digit",
                            })}
                          </strong>
                          <span>
                            {sessionDate(session.startAtUtc, {
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </time>
                        <div className={styles.sessionMain}>
                          <span className={styles.sessionTitle}>
                            {vi ? "Buổi" : "Session"} {session.sessionNo}
                            <span className={styles.weekday}>
                              {sessionDate(session.startAtUtc, {
                                weekday: "long",
                              })}
                            </span>
                          </span>
                          <div className={styles.sessionTime}>
                            <Clock3 size={16} aria-hidden="true" />
                            <time dateTime={session.startAtUtc}>
                              {formatTime(session.startAtUtc)}–
                              {formatTime(session.endAtUtc)}
                            </time>
                          </div>
                        </div>
                        <dl className={styles.sessionLocation}>
                          <div>
                            <dt>
                              <MapPin size={16} aria-hidden="true" />
                              <span className="sr-only">
                                {vi ? "Sân / phòng" : "Court / room"}
                              </span>
                            </dt>
                            <dd>
                              {session.roomName ||
                                (vi
                                  ? "Chưa có địa điểm"
                                  : "Location to be assigned")}
                            </dd>
                          </div>
                          <div>
                            <dt>
                              <UserRound size={16} aria-hidden="true" />
                              <span className="sr-only">
                                {vi ? "Huấn luyện viên" : "Coach"}
                              </span>
                            </dt>
                            <dd>
                              {session.coachName ||
                                coach ||
                                (vi ? "Đang phân công" : "To be assigned")}
                            </dd>
                          </div>
                        </dl>
                        <div className={styles.sessionState}>
                          {selected && (
                            <span className={styles.selectedLabel}>
                              {vi ? "Đang xem" : "Viewing"}
                            </span>
                          )}
                          <StatusChip value={session.status} />
                          {session.isMakeup && (
                            <span className={styles.makeupLabel}>
                              {vi ? "Buổi học bù" : "Make-up session"}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>
                  {vi
                    ? "Chưa có lịch học được công bố."
                    : "No sessions have been published yet."}
                </p>
              )
            }
          </AsyncSection>
        </section>
      </article>
    </div>
  );
}
