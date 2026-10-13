"use client";

import { useState } from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { CourseSessionDto } from "@/lib/types";
import type { TeachingRecord } from "./teaching-api";
import { AssessmentNarrative } from "./assessment-narrative";
import styles from "./student-current-assessments.module.css";

export function StudentCurrentAssessments({
  records,
  sessions,
}: {
  records: TeachingRecord[];
  sessions: CourseSessionDto[];
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const assessments = [...records]
    .filter((record) => record.kind === "RESULT")
    .sort(
      (a, b) =>
        b.updatedAtUtc.localeCompare(a.updatedAtUtc) ||
        b.recordId.localeCompare(a.recordId),
    );

  return (
    <section
      className={styles.section}
      aria-label={vi ? "Đánh giá lớp hiện tại" : "Current class assessments"}
    >
      <header className={styles.header}>
        <div>
          <h3>{vi ? "Lớp hiện tại" : "Current class"}</h3>
          <p>
            {vi
              ? "Nhận xét của lớp đang chọn, mới nhất trước."
              : "Assessments for the selected class, newest first."}
          </p>
        </div>
        <span className={styles.count}>
          {assessments.length} {vi ? "đánh giá" : "assessments"}
        </span>
      </header>
      {assessments.length === 0 ? (
        <div className={styles.empty}>
          <ClipboardCheck size={22} aria-hidden="true" />
          <strong>{vi ? "Chưa có đánh giá" : "Not assessed yet"}</strong>
          <p>
            {vi
              ? "Nhận xét sẽ xuất hiện khi coach ghi kết quả cho học viên."
              : "Feedback appears here when a coach records the student’s results."}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {assessments.map((record, index) => {
            const session = sessions.find(
              (item) => item.sessionId === record.sessionId,
            );
            const scope = record.sessionId
              ? session
                ? vi
                  ? `Đánh giá buổi ${session.sessionNo}`
                  : `Lesson ${session.sessionNo} assessment`
                : vi
                  ? "Đánh giá buổi học"
                  : "Lesson assessment"
              : vi
                ? "Đánh giá cả khóa"
                : "Course assessment";
            return (
              <details
                key={record.recordId}
                className={styles.item}
                open={
                  expandedId === record.recordId ||
                  (expandedId === null && index === 0)
                }
              >
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setExpandedId((current) =>
                      current === record.recordId ||
                      (current === null && index === 0)
                        ? ""
                        : record.recordId,
                    );
                  }}
                >
                  <span className={styles.summaryContent}>
                    <span className={styles.meta}>
                      <span className={styles.scope}>{scope}</span>
                      {index === 0 && (
                        <span className={styles.latest}>
                          {vi ? "Mới nhất" : "Latest"}
                        </span>
                      )}
                    </span>
                    <strong>{record.title}</strong>
                    <small>{formatDateTime(record.updatedAtUtc)}</small>
                  </span>
                  <span className={styles.end}>
                    {record.score !== null && (
                      <span className={styles.score}>{record.score}/5</span>
                    )}
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </summary>
                <div className={styles.body}>
                  <AssessmentNarrative content={record.content} />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
