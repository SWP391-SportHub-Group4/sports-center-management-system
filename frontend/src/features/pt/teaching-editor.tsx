"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Save, Send, Sparkles, X } from "lucide-react";
import { Feedback } from "@/components/ui";
import { useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { vietnamUtc, vietnamLocal } from "@/lib/vietnam-time";
import type { CourseSessionDto } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import {
  teachingApi,
  type TeachingMember,
  type TeachingRecord,
} from "./teaching-api";
import styles from "./coach-workspace.module.css";
import type { PlanScope } from "./training-plan-view";
import { PlanContent } from "./training-plan-view";
import { formatPlanContent } from "./plan-content";

export function TeachingEditor({
  classId,
  kind,
  members,
  sessions,
  sessionId,
  memberId,
  existing,
  planScope,
  onSaved,
  onClose,
  onStateChange,
}: {
  classId: number;
  kind: TeachingRecord["kind"];
  members: TeachingMember[];
  sessions: CourseSessionDto[];
  sessionId?: string;
  memberId?: string;
  existing?: TeachingRecord;
  planScope?: PlanScope;
  onSaved: () => void;
  onClose: () => void;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const action = useAction();
  const ai = useAction();
  const lock = useRef(false);
  const [id] = useState(() => existing?.recordId ?? crypto.randomUUID());
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [student, setStudent] = useState(existing?.memberId ?? memberId ?? "");
  const [session, setSession] = useState(
    existing?.sessionId ?? sessionId ?? "",
  );
  const [score, setScore] = useState(String(existing?.score ?? ""));
  const [due, setDue] = useState(
    existing?.dueAtUtc ? vietnamLocal(existing.dueAtUtc) : "",
  );
  const [goal, setGoal] = useState(
    members.find((m) => m.memberId === student)?.goal ?? "",
  );
  const [level, setLevel] = useState(
    members.find((m) => m.memberId === student)?.experienceLevel ?? "Beginner",
  );
  const [suggestion, setSuggestion] = useState("");
  const [scope, setScope] = useState<PlanScope>(
    existing
      ? existing.memberId
        ? "personal"
        : existing.sessionId
          ? "session"
          : "course"
      : (planScope ??
          (memberId ? "personal" : sessionId ? "session" : "course")),
  );
  const labels = {
    PLAN: vi ? "Soạn kế hoạch" : "Lesson plan",
    RESULT: vi ? "Ghi kết quả & nhận xét" : "Result & assessment",
    NOTICE: vi ? "Thông báo cho học viên" : "Notify students",
    HOMEWORK: vi ? "Giao bài tập về nhà" : "Assign homework",
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    try {
      const saved = await action.run(() =>
        teachingApi.save(
          classId,
          {
            recordId: id,
            kind,
            title,
            content,
            sessionId: session || null,
            memberId: student || null,
            score: score ? Number(score) : null,
            dueAtUtc: due ? vietnamUtc(due) : null,
            version: existing?.version ?? 0,
          },
          !!existing,
        ),
      );
      if (saved) onSaved();
    } finally {
      lock.current = false;
    }
  }
  const busy = action.busy || ai.busy;
  const dirty =
    title !== (existing?.title ?? "") ||
    content !== (existing?.content ?? "") ||
    score !== String(existing?.score ?? "") ||
    due !== (existing?.dueAtUtc ? vietnamLocal(existing.dueAtUtc) : "") ||
    student !== (existing?.memberId ?? memberId ?? "") ||
    session !== (existing?.sessionId ?? sessionId ?? "");
  useEffect(() => {
    onStateChange({ dirty, busy });
  }, [dirty, busy, onStateChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <section className={styles.editor} aria-label={labels[kind]}>
      <header className={styles.sectionHeader}>
        <h3>{labels[kind]}</h3>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          disabled={busy}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
          {vi ? "Đóng" : "Close"}
        </button>
      </header>
      <form onSubmit={save} className={styles.form}>
        {kind === "PLAN" && (
          <label>
            {vi ? "1. Phạm vi kế hoạch" : "1. Plan scope"}
            <select
              value={scope}
              disabled={busy || !!existing}
              onChange={(e) => {
                const next = e.target.value as PlanScope;
                setScope(next);
                setStudent(next === "personal" ? (memberId ?? "") : "");
                setSession(next === "course" ? "" : (sessionId ?? ""));
                const target =
                  next === "personal"
                    ? members.find((m) => m.memberId === memberId)
                    : undefined;
                setGoal(target?.goal ?? "");
                setLevel(target?.experienceLevel ?? "Beginner");
                setSuggestion("");
              }}
            >
              <option value="course">
                {vi
                  ? "Cả khóa · dành cho toàn bộ học viên"
                  : "Course · for all students"}
              </option>
              <option value="session">
                {vi
                  ? "Buổi tập · giáo án cho một buổi"
                  : "Session · one session’s lesson plan"}
              </option>
              <option value="personal">
                {vi
                  ? "Cá nhân · dành riêng cho một học viên"
                  : "Individual · for one student"}
              </option>
            </select>
            <small>
              {vi
                ? "Phạm vi quyết định học viên nào xem được kế hoạch. Sau khi lưu, phạm vi được giữ cố định."
                : "Scope determines who can see this plan and stays fixed after saving."}
            </small>
          </label>
        )}
        <div className={styles.formRow}>
          {(kind !== "PLAN" || scope === "personal") && (
            <label>
              {vi ? "Áp dụng cho" : "For"}
              <select
                value={student}
                disabled={
                  busy || !!existing || (kind === "RESULT" && !!memberId)
                }
                required={
                  kind === "RESULT" || (kind === "PLAN" && scope === "personal")
                }
                onChange={(e) => {
                  setStudent(e.target.value);
                  const m = members.find((m) => m.memberId === e.target.value);
                  setGoal(m?.goal ?? "");
                  setLevel(m?.experienceLevel ?? "Beginner");
                  setSuggestion("");
                }}
              >
                <option value="">
                  {kind === "RESULT" || kind === "PLAN"
                    ? vi
                      ? "Chọn học viên"
                      : "Select a student"
                    : vi
                      ? "Cả lớp"
                      : "Entire class"}
                </option>
                {members.map((m) => (
                  <option key={m.memberId} value={m.memberId}>
                    {m.memberName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(kind !== "PLAN" || scope !== "course") && (
            <label>
              {vi ? "Buổi học" : "Session"}
              <select
                value={session}
                disabled={busy || !!sessionId || !!existing}
                required={
                  kind === "RESULT" || (kind === "PLAN" && scope === "session")
                }
                onChange={(e) => {
                  setSession(e.target.value);
                  setSuggestion("");
                }}
              >
                <option value="">
                  {kind === "PLAN" && scope === "session"
                    ? vi
                      ? "Chọn buổi học"
                      : "Select a session"
                    : vi
                      ? "Áp dụng xuyên suốt khóa"
                      : "Throughout the course"}
                </option>
                {sessions
                  .filter((s) => !/cancel/i.test(s.status))
                  .map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {vi ? "Buổi" : "Session"} {s.sessionNo} ·{" "}
                      {formatDateTime(s.startAtUtc)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <label>
          {kind === "PLAN"
            ? vi
              ? "2. Tên kế hoạch"
              : "2. Plan title"
            : vi
              ? "Tiêu đề"
              : "Title"}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            disabled={busy}
          />
        </label>
        {kind === "PLAN" && (
          <details className={styles.aiTools}>
            <summary>
              <Sparkles size={16} aria-hidden="true" />
              {vi ? "Gợi ý giáo án bằng AI" : "AI lesson suggestions"}
            </summary>
            <div className={styles.formRow}>
              <label>
                {scope === "course"
                  ? vi
                    ? "Mục tiêu cả khóa"
                    : "Course goal"
                  : vi
                    ? "Mục tiêu tập luyện"
                    : "Training goal"}
                <input
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    setSuggestion("");
                  }}
                  maxLength={1000}
                  disabled={busy}
                />
              </label>
              <label>
                {vi ? "Trình độ" : "Experience"}
                <select
                  value={level}
                  disabled={busy}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setSuggestion("");
                  }}
                >
                  <option value="Beginner">{vi ? "Cơ bản" : "Beginner"}</option>
                  <option value="Intermediate">
                    {vi ? "Trung cấp" : "Intermediate"}
                  </option>
                  <option value="Advanced">
                    {vi ? "Nâng cao" : "Advanced"}
                  </option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={
                busy ||
                !goal.trim() ||
                (scope === "personal" && !student) ||
                (scope === "session" && !session)
              }
              onClick={async () => {
                const data = await ai.run(() =>
                  teachingApi.suggest(
                    classId,
                    student || null,
                    goal,
                    level,
                    language,
                    scope,
                    session || null,
                  ),
                );
                if (data) setSuggestion(formatPlanContent(data.content));
              }}
            >
              {ai.busy
                ? vi
                  ? "Đang tạo gợi ý…"
                  : "Generating…"
                : vi
                  ? "Tạo gợi ý"
                  : "Generate suggestion"}
            </button>
            <Feedback error={ai.error} />
            {suggestion && (
              <div className={styles.suggestion}>
                <PlanContent content={suggestion} />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={busy}
                  onClick={() => {
                    setContent(suggestion);
                    setSuggestion("");
                  }}
                >
                  {vi ? "Dùng bản gợi ý" : "Use this suggestion"}
                </button>
                <small>
                  {vi
                    ? "Xem lại và điều chỉnh trước khi lưu kế hoạch."
                    : "Review and adjust before saving the plan."}
                </small>
              </div>
            )}
          </details>
        )}
        <label>
          {kind === "PLAN"
            ? scope === "course"
              ? vi
                ? "3. Mục tiêu & lộ trình cả khóa"
                : "3. Course goals & learning roadmap"
              : vi
                ? "3. Trình tự bài tập & lưu ý"
                : "3. Exercises & notes"
            : vi
              ? "Nội dung"
              : "Content"}
          <textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            maxLength={8000}
            disabled={busy}
            placeholder={
              kind === "PLAN" && scope === "course"
                ? vi
                  ? "Mục tiêu cuối khóa · Học viên sẽ đạt được gì?\nBuổi 1–2 · Nền tảng kỹ thuật\nBuổi 3–4 · Thực hành và phối hợp\nBuổi cuối · Ôn tập và đánh giá"
                  : "Course outcome · What will students achieve?\nSessions 1–2 · Technique foundations\nSessions 3–4 · Practice and teamwork\nFinal session · Review and assessment"
                : undefined
            }
          />
          {kind === "PLAN" && (
            <small>
              {scope === "course"
                ? vi
                  ? "Nêu mục tiêu cuối khóa và nội dung của tất cả buổi học hoặc từng giai đoạn, mỗi mục một dòng. Bổ sung giáo án ở mục Buổi tập để học viên xem chi tiết trên lộ trình."
                  : "Describe the course outcome and every session or learning stage, one item per line. Add session plans for students to explore details on the roadmap."
                : vi
                  ? "Mỗi mục hoặc bài tập viết trên một dòng. Ví dụ: Khởi động · 10 phút. Học viên sẽ xem từng bước riêng."
                  : "Write each exercise or topic on a new line, e.g. Warm-up · 10 minutes. Students see each step separately."}
            </small>
          )}
        </label>
        {kind === "RESULT" && (
          <label>
            {vi ? "Đánh giá kỹ năng" : "Skill assessment"}
            <select
              value={score}
              onChange={(e) => setScore(e.target.value)}
              disabled={busy}
            >
              <option value="">{vi ? "Chưa đánh giá" : "Not assessed"}</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}/5
                </option>
              ))}
            </select>
            <small>
              {vi
                ? "So với mục tiêu đã giao, không so sánh với học viên khác."
                : "Relative to the assigned goal, not other students."}
            </small>
          </label>
        )}
        {kind === "HOMEWORK" && (
          <label>
            {vi ? "Hạn hoàn thành · Giờ Việt Nam" : "Due date · Vietnam time"}
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {(kind === "NOTICE" || kind === "HOMEWORK") && (
          <p className={styles.muted}>
            {vi
              ? "Học viên được chọn sẽ nhận thông báo trong hệ thống sau khi gửi."
              : "Selected students receive an in-app notification when you send."}
          </p>
        )}
        <Feedback error={action.error} />
        <button type="submit" className="btn" disabled={busy}>
          {kind === "NOTICE" || kind === "HOMEWORK" ? (
            <Send size={17} aria-hidden="true" />
          ) : (
            <Save size={17} aria-hidden="true" />
          )}
          {action.busy
            ? vi
              ? "Đang lưu…"
              : "Saving…"
            : kind === "NOTICE" || kind === "HOMEWORK"
              ? vi
                ? "Gửi cho học viên"
                : "Send to students"
              : vi
                ? "Lưu vào hệ thống"
                : "Save to SportHub"}
        </button>
      </form>
    </section>
  );
}
