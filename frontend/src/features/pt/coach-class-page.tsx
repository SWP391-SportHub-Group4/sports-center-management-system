"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  UserRound,
  Users,
  ChevronDown,
} from "lucide-react";
import { AsyncSection, StatusChip } from "@/components/ui";
import { CourseSticker } from "@/features/courses";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { formatDate, formatMoney } from "@/lib/format";
import type { CourseDto } from "@/lib/types";
import { ptApi } from "./api";
import { PtPage } from "./ui";
import { TeachingDetail } from "./coach-workspace";
import { classSportTone } from "./class-identity";
import styles from "./coach-class-page.module.css";

export function CoachClassPage({
  classId,
  initialTab,
}: {
  classId: number;
  initialTab: "students" | "plans";
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const state = useApi((signal) => ptApi.classes(signal), [classId]);
  return (
    <PtPage
      title="classes"
      titleText={
        state.data?.find((course) => course.classId === classId)?.name ??
        (vi ? "Chi tiết lớp học" : "Class details")
      }
    >
      <AsyncSection state={state}>
        {(classes) => {
          const course = classes.find((item) => item.classId === classId);
          return course ? (
            <ClassContent
              key={`${classId}-${initialTab}`}
              course={course}
              initialTab={initialTab}
            />
          ) : (
            <section className={styles.empty}>
              <h2>{vi ? "Không tìm thấy lớp học" : "Class not found"}</h2>
              <p>
                {vi
                  ? "Lớp không tồn tại hoặc bạn chưa được phân công phụ trách."
                  : "This class does not exist or is not assigned to you."}
              </p>
              <Link className="btn btn--secondary" href="/coach/classes">
                {vi ? "Xem danh sách lớp" : "View classes"}
              </Link>
            </section>
          );
        }}
      </AsyncSection>
    </PtPage>
  );
}

function ClassContent({
  course,
  initialTab,
}: {
  course: CourseDto;
  initialTab: "students" | "plans";
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const editing = useRef({ dirty: false, busy: false });
  return (
    <div className={styles.classPage}>
      <Link
        href="/coach/classes"
        className="btn btn--quiet"
        onClick={(event) => {
          if (
            editing.current.busy ||
            (editing.current.dirty &&
              !window.confirm(
                vi
                  ? "Nội dung chưa được lưu. Bỏ các thay đổi?"
                  : "Discard your unsaved changes?",
              ))
          )
            event.preventDefault();
        }}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        {vi ? "Quay lại danh sách lớp" : "Back to classes"}
      </Link>
      <section
        className={styles.classOverview}
        data-sport={classSportTone(course.sportName)}
        aria-label={vi ? "Thông tin lớp học" : "Class information"}
      >
        <div className={styles.identity}>
          <div className={styles.identityTags}>
            <div className={styles.sportMark} aria-hidden="true">
              <CourseSticker sport={course.sportName} compact small />
            </div>
            <span className={styles.sport}>{course.sportName}</span>
            <span className={styles.code}>{course.code}</span>
          </div>
          <StatusChip value={course.status} />
        </div>
        <dl className={styles.classFacts}>
          <div>
            <UserRound size={20} aria-hidden="true" />
            <div>
              <dt>{vi ? "Huấn luyện viên" : "Coach"}</dt>
              <dd>{course.coachName ?? "—"}</dd>
            </div>
          </div>
          <div>
            <MapPin size={20} aria-hidden="true" />
            <div>
              <dt>{vi ? "Sân / phòng tập" : "Court / room"}</dt>
              <dd>{course.roomName || "—"}</dd>
            </div>
          </div>
          <div>
            <CalendarDays size={20} aria-hidden="true" />
            <div>
              <dt>{vi ? "Ngày bắt đầu" : "Start date"}</dt>
              <dd>{formatDate(course.startDate)}</dd>
            </div>
          </div>
          <div>
            <Users size={20} aria-hidden="true" />
            <div>
              <dt>{vi ? "Quy mô lớp" : "Class size"}</dt>
              <dd>
                {course.capacity} {vi ? "học viên" : "students"} ·{" "}
                {course.numSessions} {vi ? "buổi" : "sessions"}
              </dd>
            </div>
          </div>
        </dl>
        <details className={styles.enrollment}>
          <summary>
            {vi ? "Thông tin đăng ký & học phí" : "Enrollment & course fee"}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <dl className={styles.enrollmentFacts}>
            <div>
              <dt>{vi ? "Chỗ còn lại" : "Available seats"}</dt>
              <dd>{course.availableSeats}</dd>
            </div>
            <div>
              <dt>{vi ? "Học phí" : "Course fee"}</dt>
              <dd>{formatMoney(course.price)}</dd>
            </div>
            <div>
              <dt>{vi ? "Đăng ký" : "Registration"}</dt>
              <dd>
                {course.enrollmentOpen
                  ? vi
                    ? "Đang mở"
                    : "Open"
                  : vi
                    ? "Đã đóng"
                    : "Closed"}
              </dd>
            </div>
          </dl>
        </details>
      </section>
      <div className={styles.teachingSurface}>
        <TeachingDetail
          selection={{ course }}
          fullPage
          hideHeading
          initialTab={initialTab}
          onClose={() => {}}
          onEditingStateChange={(value) => {
            editing.current = value;
          }}
        />
      </div>
    </div>
  );
}
