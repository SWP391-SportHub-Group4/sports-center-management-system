"use client";

import {
  BookOpen,
  ClipboardCheck,
  Bell,
  Pencil,
  CalendarClock,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import { AsyncSection } from "@/components/ui";
import type { CourseSessionDto } from "@/lib/types";
import { TrainingPlanView } from "./training-plan-view";
import {
  teachingApi,
  type TeachingRecord,
  type TeachingMember,
} from "./teaching-api";
import styles from "./coach-workspace.module.css";

export function TeachingRecords({
  records,
  members = [],
  onEdit,
  editableCoachId,
}: {
  records: TeachingRecord[];
  members?: TeachingMember[];
  onEdit?: (record: TeachingRecord) => void;
  editableCoachId?: string;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const labels = {
    PLAN: vi ? "Giáo án" : "Lesson plan",
    RESULT: vi ? "Kết quả & nhận xét" : "Assessment",
    NOTICE: vi ? "Thông báo" : "Notice",
    HOMEWORK: vi ? "Bài tập về nhà" : "Homework",
  };
  const icons = {
    PLAN: BookOpen,
    RESULT: ClipboardCheck,
    NOTICE: Bell,
    HOMEWORK: CalendarClock,
  };
  if (!records.length)
    return (
      <p className={styles.muted}>
        {vi
          ? "Chưa có nội dung. Coach có thể thêm ngay tại đây."
          : "No content yet. Add the first entry here."}
      </p>
    );
  return (
    <div className={styles.records}>
      {records.map((record) => {
        const Icon = icons[record.kind];
        return (
          <article
            className={styles.record}
            key={record.recordId}
            data-kind={record.kind}
          >
            <div className={styles.sectionHeader}>
              <span className={styles.recordLabel}>
                <Icon size={16} aria-hidden="true" />
                {labels[record.kind]}
              </span>
              {onEdit &&
                record.coachId === editableCoachId &&
                (record.kind === "PLAN" || record.kind === "RESULT") && (
                  <button
                    className="btn btn--quiet btn--sm"
                    type="button"
                    onClick={() => onEdit(record)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    {vi ? "Chỉnh sửa" : "Edit"}
                  </button>
                )}
            </div>
            <h3>{record.title}</h3>
            <small>
              {record.memberId
                ? (members.find((m) => m.memberId === record.memberId)
                    ?.memberName ?? (vi ? "Cá nhân" : "Individual"))
                : vi
                  ? "Cả lớp"
                  : "Entire class"}{" "}
              · {formatDateTime(record.updatedAtUtc)}
            </small>
            <p className={styles.recordContent}>{record.content}</p>
            {record.score != null && (
              <strong className={styles.badge}>
                {vi ? "Đánh giá kỹ năng" : "Skill assessment"} · {record.score}
                /5
              </strong>
            )}
            {record.dueAtUtc && (
              <p className={styles.recordLabel}>
                <CalendarClock size={16} aria-hidden="true" />
                {vi ? "Hoàn thành trước" : "Due"}{" "}
                {formatDateTime(record.dueAtUtc)}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function MemberTeachingFeed({
  classId,
  sessions = [],
}: {
  classId: number;
  sessions?: CourseSessionDto[];
}) {
  const { language } = useLanguage();
  const state = useApi(
    (signal) => teachingApi.records(classId, signal, true),
    [classId],
  );
  return (
    <section className={styles.feed}>
      <h2>{language === "vi" ? "Từ huấn luyện viên" : "From your coach"}</h2>
      <AsyncSection state={state}>
        {(records) =>
          records.length ? (
            <>
              {records.some((r) => r.kind === "PLAN") && (
                <TrainingPlanView
                  records={records}
                  sessions={sessions}
                  memberId={
                    records.find((r) => r.kind === "PLAN" && r.memberId)
                      ?.memberId ?? undefined
                  }
                />
              )}
              {records.some((r) => r.kind !== "PLAN") && (
                <TeachingRecords
                  records={records.filter((r) => r.kind !== "PLAN")}
                />
              )}
            </>
          ) : (
            <p className={styles.muted}>
              {language === "vi"
                ? "Giáo án, bài tập và nhận xét sẽ xuất hiện tại đây khi coach gửi."
                : "Your coach’s plans, homework and feedback will appear here."}
            </p>
          )
        }
      </AsyncSection>
    </section>
  );
}
