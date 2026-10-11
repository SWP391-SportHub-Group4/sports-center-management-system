"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { MemberSchedule } from "@/features/member";
import { CourseSticker } from "./course-sticker";
import { CheckoutPanel } from "@/features/payments";
import { StatusChip } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useApi, useNow } from "@/lib/useApi";
import { LockKeyhole } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatDate, formatMoney } from "@/lib/format";
import { courseApi } from "./api";
import styles from "./member-course-detail.module.css";
import { useCourseEnrollments } from "./use-course-enrollments";
import {
  courseRegistrationState,
  registrationReason,
} from "./registration-state";

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
  const [checkoutCompleted, setCheckoutCompleted] = useState(false);
  const handleCheckoutChange = useCallback(
    () => setCalendarRevision((value) => value + 1),
    [],
  );
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const { user } = useAuth();
  const enrollments = useCourseEnrollments();
  const reloadEnrollments = enrollments.reload;
  const handlePaid = useCallback(() => {
    // Keep the receipt mounted when fulfillment refreshes the enrollment list.
    setCheckoutCompleted(true);
    reloadEnrollments();
  }, [reloadEnrollments]);
  const enrolled = enrollments.isEnrolled(classId);
  const now = useNow(30000);
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
  const rows = [...(sessions.data ?? [])].sort((a, b) =>
    a.startAtUtc.localeCompare(b.startAtUtc),
  );
  const firstSession = rows.find((session) => !/CANCEL/i.test(session.status));
  const calendarStart = firstSession
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
        new Date(firstSession.startAtUtc),
      )
    : course.startDate.slice(0, 10);
  const hasSeats = course.availableSeats > 0;
  const registration = courseRegistrationState(course, enrolled, now);
  const canRegister = registration === "open";
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
            {enrolled && (
              <StatusChip
                value="CONFIRMED"
                label={vi ? "Đã đăng ký" : "Registered"}
                tone="success"
              />
            )}
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
              {enrolled
                ? vi
                  ? "Bạn đã đăng ký lớp này"
                  : "You are registered for this class"
                : !canRegister
                  ? vi
                    ? "Không nhận đăng ký"
                    : "Not accepting registrations"
                  : hasSeats
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
        {user?.role === "Member" &&
        (resumeInvoiceId ||
          checkoutCompleted ||
          (canRegister && !enrollments.loading && !enrollments.error)) ? (
          <div className={styles.payment}>
            <CheckoutPanel
              modal
              onChange={handleCheckoutChange}
              onPaid={handlePaid}
              invoiceId={resumeInvoiceId}
              intent={{ kind: "class", body: { classId } }}
              review={{
                title: vi ? "Đăng ký khóa học" : "Register for this course",
                submitLabel: vi ? "Tiếp tục thanh toán" : "Continue to payment",
                items: [],
              }}
            />
          </div>
        ) : enrolled ? (
          <Link
            className="btn btn--secondary"
            href={`/member/schedule?course=${classId}`}
          >
            {vi ? "Xem lớp đã đăng ký" : "View registered class"}
          </Link>
        ) : user?.role === "Member" && enrollments.loading ? (
          <p role="status">
            {vi ? "Đang kiểm tra đăng ký…" : "Checking registration…"}
          </p>
        ) : user?.role === "Member" && enrollments.error ? (
          <div role="alert">
            <p>
              {vi
                ? "Chưa kiểm tra được trạng thái đăng ký."
                : "Could not verify your registration."}
            </p>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={enrollments.reload}
            >
              {vi ? "Thử lại" : "Try again"}
            </button>
          </div>
        ) : !canRegister ? (
          <div className={styles.registrationClosed} role="status">
            <strong>
              <LockKeyhole size={18} aria-hidden="true" />
              {vi ? "Không thể đăng ký" : "Registration unavailable"}
            </strong>
            <p>{registrationReason(registration, vi)}</p>
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
        {canRegister &&
          !enrolled &&
          !enrollments.loading &&
          !enrollments.error && (
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
            {vi
              ? "Lịch tuần & buổi học dự kiến"
              : "Weekly schedule & course preview"}
          </h3>
          <span>
            {rows.length ? `${rows.length} ${vi ? "buổi" : "sessions"}` : null}
          </span>
        </div>
        <p className={styles.scheduleHint}>
          {vi
            ? "So sánh buổi dự kiến của khóa học với lớp đã đăng ký, lịch PT và sân đã đặt trong cùng một lịch tuần."
            : "Compare proposed course sessions with your registered classes, PT sessions and court bookings in one weekly calendar."}
        </p>
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
          key={`${classId}-${calendarRevision}-${calendarStart}`}
          compact
          initialDate={calendarStart}
          previewCourse={{
            classId,
            name: course.name,
            sportName: course.sportName,
            startDate: calendarStart,
            sessions: sessions.data ?? [],
          }}
        />
      </section>
    </div>
  );
}
