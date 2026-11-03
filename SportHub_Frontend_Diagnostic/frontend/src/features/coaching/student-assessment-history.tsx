"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronDown, History, Search } from "lucide-react";
import { AsyncSection, Dialog, Pager, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatDateTime } from "@/lib/format";
import { teachingApi, type StudentHistoryClass } from "./teaching-api";
import { AssessmentNarrative } from "./assessment-narrative";
import styles from "./student-assessment-history.module.css";

export function StudentLearningHistory({
  memberId,
  classId,
  sportName,
  compact = false,
}: {
  memberId: string;
  classId: number;
  sportName: string;
  compact?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useRef<HTMLElement>(null);
  const state = useApi(
    (signal) =>
      teachingApi.studentHistoryClasses(
        memberId,
        classId,
        page,
        search,
        signal,
      ),
    [memberId, classId, page, search],
  );
  function chooseClass(id: number) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 760px)").matches) {
      requestAnimationFrame(() => {
        detail.current?.scrollIntoView({ block: "start", behavior: "instant" });
        detail.current?.focus({ preventScroll: true });
      });
    }
  }
  return (
    <section
      className={`${styles.workspace}${compact ? ` ${styles.compact}` : ""}`}
      aria-label={vi ? "Đánh giá từ lớp trước" : "Learning history"}
    >
      <header className={styles.intro}>
        <div>
          <h3>
            {vi
              ? `Lịch sử học tập · ${sportName}`
              : `Learning history · ${sportName}`}
          </h3>
          <p>
            {vi
              ? "Chọn một lớp để xem đánh giá theo từng buổi. Lịch sử này chỉ dùng để tham khảo khi lập kế hoạch mới."
              : "Review class progress, attendance and session assessments in the same sport. Use this history to inform the student’s next plan."}
          </p>
        </div>
        <span className={styles.readOnly}>
          <BookOpen size={15} aria-hidden="true" />
          {vi ? "Chỉ xem" : "Read only"}
        </span>
      </header>
      <label className={styles.searchLabel}>
        {vi ? "Tìm lớp đã học" : "Find a class"}
        <span className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={search}
            maxLength={150}
            placeholder={vi ? "Nhập tên lớp" : "Enter class name"}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelectedId(null);
            }}
          />
        </span>
      </label>
      <AsyncSection state={state}>
        {(data) => {
          const selected =
            data.items.find((item) => item.classId === selectedId) ??
            data.items[0];
          if (!selected)
            return (
              <div className={styles.empty}>
                <History size={32} aria-hidden="true" />
                <h4>
                  {search
                    ? vi
                      ? "Không tìm thấy lớp phù hợp"
                      : "No matching classes"
                    : vi
                      ? "Chưa có đánh giá từ lớp trước"
                      : "No other classes yet"}
                </h4>
                <p>
                  {search
                    ? vi
                      ? "Thử tên lớp khác hoặc xóa tìm kiếm."
                      : "Try another class name or clear your search."
                    : vi
                      ? "Chỉ hiển thị lớp có đánh giá đã lưu cho học viên trong cùng bộ môn."
                      : "Other enrolled classes in the same sport appear here, including those without assessments."}
                </p>
                {search && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    {vi ? "Xóa tìm kiếm" : "Clear search"}
                  </button>
                )}
              </div>
            );
          return (
            <div className={styles.layout}>
              <div className={styles.classPicker}>
                <label>
                  <span className={styles.pickerHeading}>
                    {vi ? "Chọn lớp" : "Choose class"}
                    <small>
                      {data.totalCount} {vi ? "lớp" : "classes"}
                    </small>
                  </span>
                  <select
                    value={selected.classId}
                    aria-controls="student-class-assessments"
                    onChange={(event) =>
                      chooseClass(Number(event.target.value))
                    }
                  >
                    {data.items.map((item) => (
                      <option key={item.classId} value={item.classId}>
                        {item.className}
                      </option>
                    ))}
                  </select>
                </label>
                {data.totalCount > data.pageSize && (
                  <Pager
                    page={data.page}
                    pageSize={data.pageSize}
                    totalCount={data.totalCount}
                    onChange={(next) => {
                      setPage(next);
                      setSelectedId(null);
                    }}
                  />
                )}
              </div>
              <section
                ref={detail}
                id="student-class-assessments"
                tabIndex={-1}
                className={styles.detail}
                aria-label={
                  vi ? "Đánh giá của lớp đã chọn" : "Selected class assessments"
                }
              >
                <ClassAssessments
                  key={selected.classId}
                  memberId={memberId}
                  currentClassId={classId}
                  source={selected}
                />
              </section>
            </div>
          );
        }}
      </AsyncSection>
    </section>
  );
}

function ClassAssessments({
  memberId,
  currentClassId,
  source,
}: {
  memberId: string;
  currentClassId: number;
  source: StudentHistoryClass;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const state = useApi(
    (signal) =>
      teachingApi.studentHistory(
        memberId,
        currentClassId,
        page,
        signal,
        source.classId,
      ),
    [memberId, currentClassId, source.classId, page],
  );
  return (
    <>
      <header className={styles.detailHeading}>
        <h4>{source.className}</h4>
        <div className={styles.progressRow}>
          <StatusChip value={source.status} />
          <span className={styles.started}>
            {vi ? "Khai giảng " : "Started "}
            {formatDate(source.startDate)}
          </span>
        </div>
        <div className={styles.classProgress}>
          <div className={styles.progressRow}>
            <strong>
              {source.completedSessions} / {source.totalSessions} sessions
              completed
            </strong>
            <span className={styles.progressPercent}>
              {source.totalSessions > 0
                ? Math.round(
                    (source.completedSessions / source.totalSessions) * 100,
                  )
                : 0}
              %
            </span>
          </div>
          <progress
            className={styles.progress}
            value={source.completedSessions}
            max={Math.max(1, source.totalSessions)}
            aria-label="Class sessions completed"
          />
          <p>
            Class progress reflects completed lessons. Attendance below belongs
            to this student.
          </p>
        </div>
        <dl className={styles.summary}>
          <div>
            <dt>Present</dt>
            <dd>{source.presentSessions}</dd>
          </div>
          <div>
            <dt>Absent</dt>
            <dd>{source.absentSessions}</dd>
          </div>
          <div>
            <dt>{vi ? "Đánh giá" : "Assessments"}</dt>
            <dd>{source.assessmentCount}</dd>
          </div>
          <div>
            <dt>{vi ? "Điểm trung bình" : "Average score"}</dt>
            <dd>
              {source.averageScore === null
                ? "—"
                : `${source.averageScore.toFixed(1)} / 5`}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className={`btn btn--secondary ${styles.viewDetail}`}
          aria-haspopup="dialog"
          onClick={() => setDetailOpen(true)}
        >
          View detail
        </button>
      </header>
      {detailOpen &&
        createPortal(
          <Dialog
            title={`${source.className} · Assessments`}
            description="Read-only feedback for this student in this class, newest first."
            size="lg"
            onClose={() => setDetailOpen(false)}
          >
            <AsyncSection state={state}>
              {(data) => (
                <>
                  <p className={styles.listHint}>
                    {vi
                      ? "Mới nhất trước · Nhấn vào buổi học để đọc nhận xét"
                      : "Newest first · Select a session to read the assessment"}
                  </p>
                  <div className={styles.assessments}>
                    {[...data.items]
                      .sort((a, b) =>
                        b.record.updatedAtUtc.localeCompare(
                          a.record.updatedAtUtc,
                        ),
                      )
                      .map((item, index) => (
                        <details
                          key={item.record.recordId}
                          name="student-history-assessments"
                          className={styles.assessment}
                          open={
                            expandedId === item.record.recordId ||
                            (expandedId === null && page === 1 && index === 0)
                          }
                        >
                          <summary
                            onClick={(event) => {
                              event.preventDefault();
                              setExpandedId((current) =>
                                current === item.record.recordId ||
                                (current === null && page === 1 && index === 0)
                                  ? ""
                                  : item.record.recordId,
                              );
                            }}
                          >
                            <span className={styles.assessmentInfo}>
                              <span className={styles.sessionHeading}>
                                <strong>
                                  {item.sessionNo === null
                                    ? vi
                                      ? "Đánh giá cả khóa"
                                      : "Course assessment"
                                    : `${vi ? "Đánh giá buổi" : "Lesson"} ${item.sessionNo}${vi ? "" : " assessment"}`}
                                </strong>
                                <time
                                  dateTime={
                                    item.sessionStartAtUtc ??
                                    item.record.createdAtUtc
                                  }
                                >
                                  {formatDateTime(
                                    item.sessionStartAtUtc ??
                                      item.record.createdAtUtc,
                                  )}
                                </time>
                              </span>
                              <span className={styles.assessmentTitle}>
                                {item.record.title}
                              </span>
                              {page === 1 && index === 0 && (
                                <span className={styles.latest}>
                                  {vi ? "Mới nhất" : "Latest"}
                                </span>
                              )}
                              <span className={styles.author}>
                                {"Coach: "}
                                {item.coachName ||
                                  (vi ? "Chưa có tên" : "Name unavailable")}
                              </span>
                              <span className={styles.preview}>
                                {item.record.content
                                  .replace(/\s+/g, " ")
                                  .slice(0, 180)}
                                {item.record.content.replace(/\s+/g, " ")
                                  .length > 180
                                  ? "…"
                                  : ""}
                              </span>
                            </span>
                            <span className={styles.assessmentActions}>
                              {item.record.score !== null && (
                                <span className={styles.score}>
                                  {item.record.score}/5
                                </span>
                              )}
                              <ChevronDown
                                size={18}
                                className={styles.chevron}
                                aria-hidden="true"
                              />
                            </span>
                          </summary>
                          <div className={styles.fullAssessment}>
                            <h5>
                              {vi ? "Nhận xét đầy đủ" : "Full assessment"}
                            </h5>
                            <AssessmentNarrative
                              content={item.record.content}
                            />
                            <small>
                              {vi ? "Ghi nhận " : "Recorded "}
                              {formatDateTime(item.record.createdAtUtc)} ·{" "}
                              {vi ? "Cập nhật " : "Updated "}
                              {formatDateTime(item.record.updatedAtUtc)}
                            </small>
                          </div>
                        </details>
                      ))}
                  </div>
                  {!data.items.length && (
                    <p className={styles.listHint}>
                      {vi
                        ? "Lớp này chưa có đánh giá để hiển thị."
                        : "No assessments available for this class."}
                    </p>
                  )}
                  {data.totalCount > data.pageSize && (
                    <Pager
                      page={data.page}
                      pageSize={data.pageSize}
                      totalCount={data.totalCount}
                      onChange={setPage}
                    />
                  )}
                </>
              )}
            </AsyncSection>
          </Dialog>,
          document.body,
        )}
    </>
  );
}
