"use client";

import { useState } from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { CourseSessionDto } from "@/lib/types";
import type { TeachingRecord } from "./teaching-api";
import { AssessmentNarrative } from "./assessment-narrative";
import styles from "./student-current-assessments.module.css";
import summaryStyles from "./student-assessment-history.module.css";

export function StudentCurrentAssessments({
  records,
  sessions,
  className,
}: {
  records: TeachingRecord[];
  sessions: CourseSessionDto[];
  className?: string;
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
  const scores = assessments.flatMap((record) =>
    record.score === null ? [] : [record.score],
  );
  const average = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;

  return (
    <section
      className={styles.section}
      aria-label={vi ? "Đánh giá lớp hiện tại" : "Current class assessments"}
    >
      <header className={styles.header}>
        <div>
          <h3>{vi ? "Đánh giá lớp hiện tại" : "Current class assessments"}</h3>
          <p>
            {className ? `${className} · ` : ""}
            {vi ? "Mới nhất trước · Chọn một mục để xem nhận xét." : "Newest first · Select an item to read the feedback."}
          </p>
        </div>
        <span className={summaryStyles.readOnly}>
          <ClipboardCheck size={15} aria-hidden="true" />
          {vi ? "Chỉ xem" : "Read only"}
        </span>
      </header>

      {assessments.length > 0 && (
        <dl className={styles.stats}>
          <div>
            <dt>{vi ? "Số đánh giá" : "Assessments"}</dt>
            <dd>{assessments.length}</dd>
          </div>
          <div>
            <dt>{vi ? "Điểm trung bình" : "Average score"}</dt>
            <dd>{average === null ? "—" : `${average.toFixed(1)} / 5`}</dd>
          </div>
        </dl>
      )}

      {assessments.length === 0 ? (
        <div className={styles.empty}>
          <ClipboardCheck size={22} aria-hidden="true" />
          <strong>{vi ? "Chưa có đánh giá" : "Not assessed yet"}</strong>
          <p>
            {vi
              ? "Nhận xét sẽ xuất hiện tại đây sau khi Coach ghi kết quả cho học viên."
              : "Feedback will appear here after a Coach records this student’s result."}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {assessments.map((record, index) => {
            const session = sessions.find(
              (item) => item.sessionId === record.sessionId,
            );
            const isOpen =
              expandedId === record.recordId ||
              (expandedId === null && index === 0);
            const scope = record.sessionId
              ? session
                ? vi
                  ? `Buổi ${session.sessionNo}`
                  : `Session ${session.sessionNo}`
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
                open={isOpen}
              >
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setExpandedId(isOpen ? "" : record.recordId);
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
                    <small>
                      {formatDateTime(
                        session?.startAtUtc ?? record.updatedAtUtc,
                      )}
                    </small>
                  </span>
                  <span className={styles.end}>
                    {record.score !== null && (
                      <span className={styles.score}>{record.score}/5</span>
                    )}
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </summary>
                {isOpen && (
                  <div className={styles.body}>
                    <AssessmentNarrative content={record.content} />
                    <small>
                      {vi ? "Cập nhật " : "Updated "}
                      {formatDateTime(record.updatedAtUtc)}
                    </small>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
