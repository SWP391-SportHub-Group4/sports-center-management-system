"use client";

import { useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  History,
  Search,
} from "lucide-react";
import { AsyncSection, Pager, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatDateTime } from "@/lib/format";
import { teachingApi, type StudentHistoryClass } from "./teaching-api";
import styles from "./student-assessment-history.module.css";

export function StudentLearningHistory({
  memberId,
  classId,
  sportName,
}: {
  memberId: string;
  classId: number;
  sportName: string;
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
      className={styles.workspace}
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
              <section
                className={styles.classes}
                aria-label={vi ? "Các lớp đã học" : "Other classes"}
              >
                <header className={styles.listHeading}>
                  <strong>
                    {data.totalCount} {vi ? "lớp" : "classes"}
                  </strong>
                  <small>
                    {vi ? "Đánh giá gần nhất trước" : "Latest activity first"}
                  </small>
                </header>
                <div className={styles.classRows}>
                  {data.items.map((item) => (
                    <button
                      type="button"
                      key={item.classId}
                      className={styles.classRow}
                      aria-pressed={selected.classId === item.classId}
                      aria-controls="student-class-assessments"
                      onClick={() => chooseClass(item.classId)}
                    >
                      <span className={styles.classTitle}>
                        <strong>{item.className}</strong>
                        <ChevronRight size={17} aria-hidden="true" />
                      </span>
                      <span className={styles.progressRow}>
                        <StatusChip value={item.status} />
                        <span>
                          {item.completedSessions} / {item.totalSessions}{" "}
                          sessions completed
                        </span>
                      </span>
                      <progress
                        className={styles.progress}
                        value={item.completedSessions}
                        max={Math.max(1, item.totalSessions)}
                        aria-label={`${item.className}: sessions completed`}
                      />
                      <span>
                        {item.assessmentCount} {vi ? "đánh giá" : "assessments"}
                        {item.averageScore !== null &&
                          ` · ${item.averageScore.toFixed(1)}/5`}
                      </span>
                      <small>
                        {vi ? "Ghi nhận gần nhất: " : "Last assessed: "}
                        {item.lastRecordedAtUtc
                          ? formatDate(item.lastRecordedAtUtc)
                          : "Not recorded yet"}
                      </small>
                    </button>
                  ))}
                </div>
                {data.totalCount > data.pageSize && (
                  <div className={styles.listPager}>
                    <Pager
                      page={data.page}
                      pageSize={data.pageSize}
                      totalCount={data.totalCount}
                      onChange={(next) => {
                        setPage(next);
                        setSelectedId(null);
                      }}
                    />
                  </div>
                )}
              </section>
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
        <div className={styles.progressRow}>
          <h4>{source.className}</h4>
          <StatusChip value={source.status} />
        </div>
        <p>
          {vi ? "Khai giảng " : "Started "}
          {formatDate(source.startDate)}
        </p>
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
            <dt>{vi ? "Đánh giá đã ghi" : "Recorded assessments"}</dt>
            <dd>{source.assessmentCount}</dd>
          </div>
          <div>
            <dt>
              {vi ? "Điểm đánh giá trung bình" : "Average assessment score"}
            </dt>
            <dd>
              {source.averageScore === null
                ? "—"
                : `${source.averageScore.toFixed(1)} / 5`}
            </dd>
          </div>
        </dl>
      </header>
      <AsyncSection state={state}>
        {(data) => (
          <>
            <p className={styles.listHint}>
              {vi
                ? "Mới nhất trước · Nhấn vào buổi học để đọc nhận xét"
                : "Newest first · Select a session to read the assessment"}
            </p>
            <div className={styles.assessments}>
              {data.items.map((item) => (
                <details
                  key={item.record.recordId}
                  name="student-history-assessments"
                  className={styles.assessment}
                >
                  <summary>
                    <span className={styles.assessmentInfo}>
                      <span className={styles.sessionHeading}>
                        <strong>
                          {item.sessionNo === null
                            ? vi
                              ? "Đánh giá học viên"
                              : "Student assessment"
                            : `${vi ? "Buổi" : "Session"} ${item.sessionNo}`}
                        </strong>
                        <time
                          dateTime={
                            item.sessionStartAtUtc ?? item.record.createdAtUtc
                          }
                        >
                          {formatDateTime(
                            item.sessionStartAtUtc ?? item.record.createdAtUtc,
                          )}
                        </time>
                      </span>
                      <span className={styles.assessmentTitle}>
                        {item.record.title}
                      </span>
                      <span className={styles.author}>
                        {"Coach: "}
                        {item.coachName ||
                          (vi ? "Chưa có tên" : "Name unavailable")}
                      </span>
                      <span className={styles.preview}>
                        {item.record.content.replace(/\s+/g, " ").slice(0, 180)}
                        {item.record.content.replace(/\s+/g, " ").length > 180
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
                    <h5>{vi ? "Nhận xét đầy đủ" : "Full assessment"}</h5>
                    <p>{item.record.content}</p>
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
    </>
  );
}
