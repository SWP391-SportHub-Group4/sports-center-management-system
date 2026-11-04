"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
} from "lucide-react";
import { StatusChip } from "@/components/ui";
import { CoachProfilePreview } from "@/components/CoachProfilePreview";
import { api } from "@/lib/apiClient";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { useUserAvatar } from "@/lib/user-avatar";
import { useAccessGuard } from "@/lib/use-access-guard";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatTime } from "@/lib/format";
import { courseApi } from "@/features/courses";
import { MemberTeachingFeed } from "@/features/coaching";
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
  const revoked = useAccessGuard(`member-class-${classId}`, (signal) =>
    courseApi.sessions(classId, true, signal),
  );
  const enrollment = state.data?.enrollment;
  const name =
    enrollment?.className ??
    event?.title ??
    (vi ? "Khóa học đã đăng ký" : "Enrolled course");
  const sport = enrollment?.sportName ?? event?.sport;
  const coach = enrollment?.coachName ?? event?.coachName;
  const coaches = useApi(
    (signal) =>
      api.get<{ userId: string; fullName: string; avatarUrl: string | null }[]>(
        "/api/coaches",
        {
          anonymous: true,
          signal,
        },
      ),
    [],
  );
  const coachRecord = coaches.data?.find((row) =>
    enrollment?.coachId
      ? row.userId === enrollment.coachId
      : row.fullName === coach,
  );
  const coachId = enrollment?.coachId ?? coachRecord?.userId;
  const coachAvatar = useUserAvatar(coachId, coachRecord?.avatarUrl);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const completed = Math.max(0, enrollment?.completedSessions ?? 0);
  const total = Math.max(0, enrollment?.numSessions ?? 0);
  const coachPortrait = (
    <>
      <Image
        src={
          coachAvatar && coachAvatar !== failedAvatar
            ? coachAvatar
            : DEFAULT_AVATAR
        }
        width={800}
        height={1000}
        alt={coach || (vi ? "Huấn luyện viên" : "Your coach")}
        onError={() => setFailedAvatar(coachAvatar)}
        priority
      />
      <span className={styles.coachCaption}>
        <span>{vi ? "Huấn luyện viên" : "Your coach"}</span>
        <strong>{coach || (vi ? "Đang phân công" : "To be assigned")}</strong>
      </span>
    </>
  );
  if (
    revoked ||
    (state.error && "status" in state.error && state.error.status === 403)
  )
    return (
      <section className={styles.page}>
        <h2>Class access has ended</h2>
        <p>
          Your invoices and registration history remain available in Billing and
          My schedule.
        </p>
        <button className="btn btn--secondary" onClick={onBack}>
          Back to my schedule
        </button>
      </section>
    );
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
          <div className={styles.coach}>
            {coachId && coach ? (
              <CoachProfilePreview
                coachId={coachId}
                name={coach}
                sport={sport}
                className={styles.coachTrigger}
              >
                {coachPortrait}
              </CoachProfilePreview>
            ) : (
              coachPortrait
            )}
          </div>
          <div className={styles.summary}>
            <div className={styles.sport}>
              <CalendarSticker kind="class" sport={sport} />
              <span>{sport}</span>
            </div>
            <h2 ref={heading} tabIndex={-1} id="schedule-course-title">
              {name}
            </h2>
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
              <div className={styles.progressFact}>
                <dt>{vi ? "Tiến độ hoàn thành" : "Course progress"}</dt>
                <dd>
                  <span className={styles.progressCount}>
                    {enrollment ? `${completed}/${total}` : "—"}
                  </span>
                  <progress
                    className={styles.progressBar}
                    value={Math.min(completed, total)}
                    max={Math.max(total, 1)}
                    aria-label={
                      vi ? "Số buổi đã hoàn thành" : "Completed sessions"
                    }
                  />
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
        <MemberTeachingFeed
          classId={classId}
          sessions={state.data?.sessions ?? []}
        />
      </article>
    </div>
  );
}
