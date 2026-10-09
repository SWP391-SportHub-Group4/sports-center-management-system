"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { MemberSchedule } from "@/features/member";
import { CourseSticker } from "./course-sticker";
import { CheckoutPanel } from "@/features/payments";
import { StatusChip } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatMoney } from "@/lib/format";
import { courseApi } from "./api";
import styles from "./member-course-detail.module.css";

export function CourseDetail({
  classId,
  headingLevel = 2,
}: {
  classId: number;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const [resumeInvoiceId] = useState(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("checkout") ??
        undefined),
  );
  const [calendarRevision, setCalendarRevision] = useState(0);
  const handleCheckoutChange = useCallback(
    () => setCalendarRevision((value) => value + 1),
    [],
  );
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const { user } = useAuth();
  const state = useApi(
    (signal) => courseApi.detail(classId, signal),
    [classId],
  );
  const sessions = useApi(
    (signal) => courseApi.sessions(classId, false, signal),
    [classId],
  );

  if (state.loading)
    return (
      <div
        className={styles.loading}
        aria-busy="true"
        aria-label={t.refactor.loading}
      >
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  if (state.error)
    return (
      <div className={styles.failure} role="alert">
        <p>{state.error.message}</p>
        <button className="btn btn--secondary" onClick={state.reload}>
          {vi ? "Thử lại" : "Try again"}
        </button>
      </div>
    );
  const course = state.data;
  if (!course) return <p role="status">{t.refactor.empty}</p>;
  const rows = [...(sessions.data ?? [])].sort(
    (a, b) => a.sessionNo - b.sessionNo,
  );
  const hasSeats = course.availableSeats > 0;
  const facts = [
    [
      vi ? "Huấn luyện viên" : "Coach",
      course.coachName || (vi ? "Đang phân công" : "To be assigned"),
    ],
    [vi ? "Sân / phòng" : "Court / room", course.roomName],
    [vi ? "Khai giảng" : "Starts", formatDate(course.startDate)],
    [
      vi ? "Số buổi" : "Sessions",
      `${course.numSessions} ${vi ? "buổi" : "sessions"}`,
    ],
  ];

  return (
    <div className={styles.layout}>
      <article className={styles.main}>
        <header className={styles.heading}>
          <div className={styles.meta}>
            <span>{course.sportName}</span>
            <span>{course.code}</span>
            <StatusChip value={course.status} />
          </div>
          <Heading>{course.name}</Heading>
        </header>
        <CourseSticker sport={course.sportName} compact />
        <dl className={styles.facts}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </article>

      <aside
        className={styles.enrollment}
        id="course-enrollment"
        tabIndex={-1}
        aria-label={vi ? "Đăng ký lớp học" : "Class registration"}
      >
        <div className={styles.fee}>
          <span>{vi ? "Học phí toàn khóa" : "Full course fee"}</span>
          <strong>{formatMoney(course.price)}</strong>
        </div>
        <div className={styles.capacity}>
          <div>
            <strong>
              {hasSeats
                ? vi
                  ? `Còn ${course.availableSeats} chỗ`
                  : `${course.availableSeats} spots left`
                : vi
                  ? "Lớp đã đủ người"
                  : "Class is full"}
            </strong>
            <span>
              {vi ? `Sĩ số ${course.capacity}` : `Capacity ${course.capacity}`}
            </span>
          </div>
        </div>
        {user?.role === "Member" && hasSeats ? (
          <div className={styles.payment}>
            <CheckoutPanel
              modal
              onChange={handleCheckoutChange}
              invoiceId={resumeInvoiceId}
              intent={{ kind: "class", body: { classId } }}
              review={{
                title: vi ? "Đăng ký khóa học" : "Register for this course",
                submitLabel: vi ? "Tiếp tục thanh toán" : "Continue to payment",
                items: [],
              }}
            />
          </div>
        ) : !user ? (
          <Link
            className="btn"
            href={`/login?next=${encodeURIComponent(`/member/services/courses/${classId}`)}`}
          >
            {vi ? "Đăng nhập để đăng ký" : "Sign in to register"}
          </Link>
        ) : !hasSeats ? (
          <p className={styles.muted}>
            {vi
              ? "Bạn có thể chọn lớp khác trong Dịch vụ."
              : "Explore Services to find another class."}
          </p>
        ) : null}
        {hasSeats && (
          <p className={styles.policy}>
            {vi
              ? "Giữ chỗ 15 phút sau khi tạo đơn."
              : "Your place is held for 15 minutes after creating an order."}
          </p>
        )}
      </aside>
      <section
        className={styles.schedule}
        aria-labelledby={`course-${classId}-schedule`}
      >
        <div className={styles.sectionHeading}>
          <h3 id={`course-${classId}-schedule`}>
            {vi ? "Lịch của bạn" : "Your schedule"}
          </h3>
          <span>
            {rows.length ? `${rows.length} ${vi ? "buổi" : "sessions"}` : null}
          </span>
        </div>
        {sessions.loading && <p role="status">{t.refactor.loading}</p>}
        {sessions.error && (
          <div role="alert">
            <p>{sessions.error.message}</p>
            <button className="btn btn--quiet" onClick={sessions.reload}>
              {vi ? "Tải lại lịch dự kiến" : "Reload proposed sessions"}
            </button>
          </div>
        )}
        {!sessions.loading && !sessions.error && !rows.length && (
          <p className={styles.muted}>
            {vi
              ? "Lịch khóa học đang được cập nhật."
              : "Course sessions are being updated."}
          </p>
        )}
        <MemberSchedule
          key={`${classId}-${calendarRevision}`}
          compact
          previewCourse={{
            classId,
            name: course.name,
            sportName: course.sportName,
            startDate: course.startDate.slice(0, 10),
            sessions: sessions.data ?? [],
          }}
        />
      </section>
    </div>
  );
}
