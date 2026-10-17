"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { Dialog } from "@/components/ui";
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
  const [detailOpen, setDetailOpen] = useState(false);
  const assessments = [...records]
    .filter((record) => record.kind === "RESULT")
    .sort(
      (a, b) =>
        b.updatedAtUtc.localeCompare(a.updatedAtUtc) ||
        b.recordId.localeCompare(a.recordId),
    );
  const completed = sessions.filter((session) =>
    /completed/i.test(session.status),
  ).length;
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
          <h3>{vi ? "Lớp hiện tại" : "Current class"}</h3>
          <p>
            {vi
              ? "Nhận xét của lớp đang chọn, mới nhất trước."
              : "Assessments for the selected class, newest first."}
          </p>
        </div>
        <span className={summaryStyles.readOnly}>
          <ClipboardCheck size={15} aria-hidden="true" />
          Read only
        </span>
      </header>
      <div className={styles.selection}>
        <span>Selected class</span>
        <strong>{className ?? "Current class"}</strong>
      </div>
      <div className={`${summaryStyles.detailHeading} ${styles.summaryCard}`}>
        <h4>{className ?? "Current class"}</h4>
        <div className={summaryStyles.classProgress}>
          <div className={summaryStyles.progressRow}>
            <strong>
              {completed} / {sessions.length} sessions completed
            </strong>
            <span className={summaryStyles.progressPercent}>
              {sessions.length
                ? Math.round((completed / sessions.length) * 100)
                : 0}
              %
            </span>
          </div>
          <progress
            className={summaryStyles.progress}
            value={completed}
            max={Math.max(1, sessions.length)}
            aria-label="Class sessions completed"
          />
          <p>
            Class progress reflects completed lessons. Assessments below belong
            to this student.
          </p>
        </div>
        <dl className={summaryStyles.summary}>
          <div>
            <dt>Assessments</dt>
            <dd>{assessments.length}</dd>
          </div>
          <div>
            <dt>Average score</dt>
            <dd>{average === null ? "—" : `${average.toFixed(1)} / 5`}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd className={styles.lastUpdated}>
              {assessments[0]
                ? formatDateTime(assessments[0].updatedAtUtc)
                : "Not assessed yet"}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn--secondary"
          aria-haspopup="dialog"
          onClick={() => setDetailOpen(true)}
        >
          View detail
        </button>
      </div>
      {detailOpen &&
        createPortal(
          <Dialog
            title={`${className ?? "Current class"} · Assessments`}
            description="Results for this student in the selected class, newest first."
            size="lg"
            onClose={() => setDetailOpen(false)}
          >
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
                            <span className={styles.score}>
                              {record.score}/5
                            </span>
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
          </Dialog>,
          document.body,
        )}
    </section>
  );
}
