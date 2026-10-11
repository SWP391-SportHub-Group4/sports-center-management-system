"use client";

import { useId, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  UserRound,
  ChevronDown,
  Pencil,
  Plus,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { CourseSessionDto } from "@/lib/types";
import type { TeachingRecord, TeachingMember } from "./teaching-api";
import styles from "./training-plan-view.module.css";
import { formatPlanContent } from "./plan-content";

export type PlanScope = "course" | "session" | "personal";
export const planScopeOf = (record: TeachingRecord): PlanScope =>
  record.memberId ? "personal" : record.sessionId ? "session" : "course";

export function TrainingPlanView({
  records,
  members = [],
  sessions,
  sessionId,
  memberId,
  onCreate,
  onEdit,
  editableCoachId,
}: {
  records: TeachingRecord[];
  members?: TeachingMember[];
  sessions: CourseSessionDto[];
  sessionId?: string;
  memberId?: string;
  onCreate?: (scope: PlanScope, sessionId?: string, memberId?: string) => void;
  onEdit?: (record: TeachingRecord) => void;
  editableCoachId?: string;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [scope, setScope] = useState<PlanScope>(
    memberId ? "personal" : sessionId ? "session" : "course",
  );
  const [student, setStudent] = useState(memberId ?? "");
  const [session, setSession] = useState(sessionId ?? "");
  const plans = records.filter((r) => r.kind === "PLAN");
  const labels = {
    course: vi ? "Cả khóa" : "Course",
    session: vi ? "Buổi tập" : "Session",
    personal: vi ? "Cá nhân" : "Individual",
  };
  const descriptions = {
    course: vi
      ? "Lộ trình từ buổi đầu đến buổi cuối: mục tiêu toàn khóa và nội dung sẽ học ở từng buổi."
      : "Your complete roadmap: course goals and what you will learn in each session.",
    session: vi
      ? "Các bài tập và trình tự thực hiện của từng buổi học."
      : "Exercises and training sequence for each session.",
    personal: vi
      ? "Kế hoạch riêng của từng học viên; có thể gắn với một buổi học."
      : "A student’s individual plan, optionally linked to a session.",
  };
  const icons = {
    course: BookOpen,
    session: CalendarDays,
    personal: UserRound,
  };
  const scoped = plans.filter((r) => planScopeOf(r) === scope);
  const visible = scoped.filter((r) =>
    scope === "personal"
      ? (!student || r.memberId === student) &&
        (!sessionId || !r.sessionId || r.sessionId === sessionId)
      : scope === "session"
        ? !session || r.sessionId === session
        : true,
  );
  const usedSessions = sessions
    .filter((s) => scoped.some((r) => r.sessionId === s.sessionId))
    .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  return (
    <section
      className={styles.workspace}
      aria-label={
        vi ? "Kế hoạch tập luyện theo phạm vi" : "Training plans by scope"
      }
    >
      <div
        className={styles.scopeTabs}
        role="group"
        aria-label={vi ? "Phạm vi kế hoạch" : "Plan scope"}
      >
        {(["course", "session", "personal"] as const).map((id) => {
          const Icon = icons[id];
          return (
            <button
              type="button"
              key={id}
              data-scope={id}
              aria-pressed={scope === id}
              onClick={() => setScope(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{labels[id]}</span>
              <strong>
                {plans.filter((r) => planScopeOf(r) === id).length}
              </strong>
            </button>
          );
        })}
      </div>
      <p className={styles.scopeDescription}>{descriptions[scope]}</p>
      <div className={styles.toolbar}>
        {scope === "session" && !sessionId && usedSessions.length > 0 && (
          <label>
            {vi ? "Buổi học" : "Session"}
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
            >
              <option value="">
                {vi ? "Tất cả buổi học" : "All sessions"}
              </option>
              {usedSessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {vi ? "Buổi" : "Session"} {s.sessionNo} ·{" "}
                  {formatDateTime(s.startAtUtc)}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === "personal" && !memberId && members.length > 0 && (
          <label>
            {vi ? "Học viên" : "Student"}
            <select
              value={student}
              onChange={(e) => setStudent(e.target.value)}
            >
              <option value="">
                {vi ? "Tất cả học viên" : "All students"}
              </option>
              {members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.memberName}
                </option>
              ))}
            </select>
          </label>
        )}
        {onCreate && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              onCreate(
                scope,
                scope === "course"
                  ? undefined
                  : sessionId || session || undefined,
                scope === "personal"
                  ? memberId || student || undefined
                  : undefined,
              )
            }
          >
            <Plus size={16} aria-hidden="true" />
            {vi
              ? `Tạo kế hoạch ${labels[scope].toLowerCase()}`
              : `New ${labels[scope].toLowerCase()} plan`}
          </button>
        )}
      </div>
      {visible.length ? (
        <PlanList
          key={`${scope}-${student}-${session}`}
          records={visible}
          scope={scope}
          sessions={sessions}
          members={members}
          onEdit={onEdit}
          editableCoachId={editableCoachId}
        />
      ) : (
        <div className={styles.empty}>
          <BookOpen size={28} aria-hidden="true" />
          <h3>
            {vi ? "Chưa có kế hoạch trong mục này" : "No plans in this view"}
          </h3>
          <p>
            {onCreate
              ? vi
                ? "Tạo kế hoạch mới với phạm vi đã chọn, hoặc chọn học viên / buổi khác."
                : "Create a plan for this scope, or select another student or session."
              : vi
                ? "Kế hoạch sẽ xuất hiện tại đây khi coach lưu."
                : "Plans appear here when your coach saves them."}
          </p>
        </div>
      )}
      {scope === "course" && (
        <CourseRoadmap
          sessions={sessions}
          records={plans}
          onCreate={onCreate}
          onEdit={onEdit}
          editableCoachId={editableCoachId}
        />
      )}
    </section>
  );
}

function PlanList({
  records,
  scope,
  sessions,
  members,
  onEdit,
  editableCoachId,
  initiallyExpanded = false,
}: {
  records: TeachingRecord[];
  scope: PlanScope;
  sessions: CourseSessionDto[];
  members: TeachingMember[];
  onEdit?: (record: TeachingRecord) => void;
  editableCoachId?: string;
  initiallyExpanded?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [expanded, setExpanded] = useState<string | null>(
    initiallyExpanded ? (records[0]?.recordId ?? null) : null,
  );
  const base = useId();
  return (
    <div className={styles.planList}>
      {records.map((record) => {
        const session = sessions.find((s) => s.sessionId === record.sessionId);
        const member = members.find((m) => m.memberId === record.memberId);
        const open = expanded === record.recordId;
        const scopeLabel =
          scope === "personal"
            ? (member?.memberName ??
              (vi ? "Kế hoạch cá nhân" : "Personal plan"))
            : scope === "session"
              ? session
                ? `${vi ? "Buổi" : "Session"} ${session.sessionNo}`
                : vi
                  ? "Buổi tập"
                  : "Session"
              : vi
                ? "Toàn bộ học viên trong khóa"
                : "All students in this course";
        const panelId = `${base}-${record.recordId}`;
        return (
          <article
            key={record.recordId}
            className={styles.plan}
            data-scope={scope}
            data-expanded={open}
          >
            <button
              className={styles.planSummary}
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setExpanded(open ? null : record.recordId)}
            >
              <span className={styles.summaryMain}>
                <span className={styles.scopeLabel}>
                  {scopeLabel}
                  {scope === "personal" &&
                    record.sessionId &&
                    ` · ${session ? `${vi ? "Buổi" : "Session"} ${session.sessionNo}` : vi ? "Theo buổi" : "Session plan"}`}
                </span>
                <strong>{record.title}</strong>
                <small>
                  {record.sessionId
                    ? session
                      ? formatDateTime(session.startAtUtc)
                      : vi
                        ? "Buổi học chưa có thông tin thời gian"
                        : "Session time unavailable"
                    : vi
                      ? "Áp dụng trong toàn khóa"
                      : "Applies throughout the course"}
                </small>
                {!open && (
                  <span className={styles.preview}>{record.content}</span>
                )}
              </span>
              <ChevronDown
                className={styles.chevron}
                size={19}
                aria-hidden="true"
              />
            </button>
            <div id={panelId} hidden={!open} className={styles.planBody}>
              <PlanContent content={record.content} />
              <footer className={styles.planFooter}>
                <small>
                  {vi ? "Cập nhật" : "Updated"}{" "}
                  {formatDateTime(record.updatedAtUtc)}
                </small>
                {onEdit && record.coachId === editableCoachId && (
                  <button
                    type="button"
                    className="btn btn--quiet btn--sm"
                    onClick={() => onEdit(record)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    {vi ? "Chỉnh sửa" : "Edit"}
                  </button>
                )}
              </footer>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CourseRoadmap({
  sessions,
  records,
  onCreate,
  onEdit,
  editableCoachId,
}: {
  sessions: CourseSessionDto[];
  records: TeachingRecord[];
  onCreate?: (scope: PlanScope, sessionId?: string, memberId?: string) => void;
  onEdit?: (record: TeachingRecord) => void;
  editableCoachId?: string;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const ordered = sessions
    .filter((s) => !/cancel/i.test(s.status))
    .slice()
    .sort(
      (a, b) =>
        a.sessionNo - b.sessionNo || a.startAtUtc.localeCompare(b.startAtUtc),
    );
  const courseTopics = new Map<number, string[]>();
  for (const plan of records.filter((r) => !r.sessionId && !r.memberId)) {
    for (const line of formatPlanContent(plan.content).split("\n")) {
      const match = line.match(/^(?:Buổi|Session)\s+(\d+)\s*·\s*(.+)$/i);
      if (match) {
        const number = Number(match[1]);
        courseTopics.set(number, [
          ...(courseTopics.get(number) ?? []),
          match[2],
        ]);
      }
    }
  }
  const planned = ordered.filter(
    (s) =>
      courseTopics.has(s.sessionNo) ||
      records.some((r) => r.sessionId === s.sessionId && !r.memberId),
  ).length;
  return (
    <section
      className={styles.roadmap}
      aria-label={vi ? "Lộ trình cả khóa học" : "Full course roadmap"}
    >
      <header className={styles.roadmapHeader}>
        <h3>
          {vi
            ? "Bạn sẽ học gì trong khóa này?"
            : "What will you learn in this course?"}
        </h3>
        <p>
          {vi
            ? `${ordered.length} buổi học · ${planned} buổi đã có nội dung`
            : `${ordered.length} sessions · ${planned} with published plans`}
        </p>
      </header>
      {!ordered.length && (
        <p className={styles.scopeDescription}>
          {vi
            ? "Lộ trình theo buổi sẽ xuất hiện khi lịch học được thiết lập."
            : "The session roadmap appears once the course schedule is set."}
        </p>
      )}
      <ol className={styles.roadmapList}>
        {ordered.map((s) => {
          const lessonPlans = records.filter(
            (r) => r.sessionId === s.sessionId && !r.memberId,
          );
          return (
            <li key={s.sessionId}>
              <span className={styles.roadmapNumber} aria-hidden="true">
                {String(s.sessionNo).padStart(2, "0")}
              </span>
              <div className={styles.roadmapContent}>
                <header>
                  <strong>
                    {vi ? "Buổi" : "Session"} {s.sessionNo}
                    {s.isMakeup ? (vi ? " · Học bù" : " · Makeup") : ""}
                  </strong>
                  <small>{formatDateTime(s.startAtUtc)}</small>
                </header>
                {courseTopics.get(s.sessionNo)?.map((topic, index) => (
                  <p key={index} className={styles.scopeDescription}>
                    {topic}
                  </p>
                ))}
                {lessonPlans.length ? (
                  lessonPlans.map((plan) => (
                    <div key={plan.recordId} className={styles.roadmapLesson}>
                      <h4>{plan.title}</h4>
                      <p className={styles.roadmapTopics}>
                        {plan.content
                          .split(/\r?\n/)
                          .filter((line) => line.trim())
                          .join(" · ")}
                      </p>
                      <details className={styles.roadmapDetails}>
                        <summary>
                          {vi
                            ? "Xem nội dung buổi học"
                            : "View session content"}
                        </summary>
                        <PlanContent content={plan.content} />
                        {onEdit && plan.coachId === editableCoachId && (
                          <button
                            type="button"
                            className="btn btn--quiet btn--sm"
                            onClick={() => onEdit(plan)}
                          >
                            <Pencil size={15} aria-hidden="true" />
                            {vi ? "Chỉnh sửa" : "Edit"}
                          </button>
                        )}
                      </details>
                    </div>
                  ))
                ) : (
                  <>
                    {!courseTopics.has(s.sessionNo) && (
                      <p className={styles.scopeDescription}>
                        {vi
                          ? "Coach chưa cập nhật nội dung buổi này."
                          : "Your coach has not added this session’s content yet."}
                      </p>
                    )}
                    {onCreate && s.coachId === editableCoachId && (
                      <button
                        type="button"
                        className="btn btn--quiet btn--sm"
                        onClick={() => onCreate("session", s.sessionId)}
                      >
                        <Plus size={15} aria-hidden="true" />
                        {vi ? "Thêm nội dung buổi học" : "Add session content"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function PlanContent({ content }: { content: string }) {
  const { language } = useLanguage();
  const lines = formatPlanContent(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <ol
      className={styles.steps}
      aria-label={language === "vi" ? "Nội dung kế hoạch" : "Plan content"}
    >
      {lines.map((raw, index) => {
        const line = raw.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "");
        const separator = line.indexOf(" · ");
        const title = separator > 0 ? line.slice(0, separator) : null;
        const text = separator > 0 ? line.slice(separator + 3) : line;
        return (
          <li key={index}>
            <span className={styles.stepIndex} aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              {title && <strong>{title}</strong>}
              {text.length > 300 ? (
                <details className={styles.longText}>
                  <summary>
                    <span>{text.slice(0, 200)}…</span>
                    <small className={styles.readMore}>
                      {language === "vi" ? "Đọc đầy đủ" : "Read full text"}
                    </small>
                    <small className={styles.readLess}>
                      {language === "vi" ? "Thu gọn" : "Collapse"}
                    </small>
                  </summary>
                  <p>{text}</p>
                </details>
              ) : (
                <p>{text}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
