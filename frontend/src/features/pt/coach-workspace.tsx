"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  CalendarDays,
  Users,
  BookOpen,
  Plus,
  Check,
  X,
  Target,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Drawer, Tabs } from "@/components/primitives";
import { Calendar } from "@/components/scheduling/Calendar";
import type { CalendarView } from "@/components/scheduling/calendar.contract";
import { AsyncSection, Feedback, StatusChip } from "@/components/ui";
import { CourseSticker } from "@/features/courses";
import { useApi, useAction, useNow } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { addDaysIso, todayIso, formatDateTime, formatTime } from "@/lib/format";
import type { CourseDto, CourseSessionDto } from "@/lib/types";
import { ptApi } from "./api";
import {
  teachingApi,
  type TeachingRecord,
  type TeachingMember,
} from "./teaching-api";
import { TeachingEditor } from "./teaching-editor";
import { TeachingRecords } from "./teaching-records";
import { TrainingPlanView, type PlanScope } from "./training-plan-view";
import styles from "./coach-workspace.module.css";

export type WorkspaceMode = "schedule" | "classes" | "students";
type Selection = {
  course: CourseDto;
  session?: CourseSessionDto;
  member?: TeachingMember;
};

function monday(value = todayIso()) {
  const today = value;
  return addDaysIso(
    today,
    -((new Date(`${today}T12:00:00+07:00`).getUTCDay() + 6) % 7),
  );
}

export function CoachWorkspace({
  mode,
  initialClassId,
}: {
  mode: WorkspaceMode;
  initialClassId?: number;
}) {
  const { language } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const vi = language === "vi";
  const [date, setDate] = useState(() => monday());
  const [view, setView] = useState<CalendarView>("week");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const state = useApi(
    async (signal) => {
      const classes = await ptApi.classes(signal);
      const sessions = (
        await Promise.all(
          classes.map((c) => ptApi.classSessions(c.classId, signal)),
        )
      )
        .flat()
        .filter((s) => s.coachId === user?.userId);
      return { classes, sessions };
    },
    [user?.userId],
  );
  const labels = {
    schedule: vi ? "Lịch dạy" : "Teaching schedule",
    classes: vi ? "Lớp phụ trách" : "Assigned classes",
    students: vi ? "Học viên" : "Students",
  };
  const icons = { schedule: CalendarDays, classes: BookOpen, students: Users };
  const initial = state.data?.classes.find((c) => c.classId === initialClassId);
  const current = selection ?? (initial ? { course: initial } : null);
  return (
    <div className={styles.workspace}>
      <header className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>
            {vi ? "KHÔNG GIAN HUẤN LUYỆN" : "COACH WORKSPACE"}
          </span>
          <h2>
            {mode === "schedule"
              ? vi
                ? "Sẵn sàng cho buổi dạy"
                : "Ready for your next session"
              : mode === "classes"
                ? vi
                  ? "Quản lý các lớp được giao"
                  : "Manage your assigned classes"
                : vi
                  ? "Theo dõi tiến bộ học viên"
                  : "Follow your students’ progress"}
          </h2>
          <p>
            {vi
              ? "Từ buổi học đến tiến bộ của từng học viên. Mọi thao tác trong cùng một không gian."
              : "From each session to each student’s progress. Your teaching tools in one place."}
          </p>
        </div>
        <CourseSticker
          sport={state.data?.classes[0]?.sportName ?? "Badminton"}
          compact
        />
      </header>
      <nav
        className={styles.bookmarks}
        aria-label={vi ? "Không gian Coach" : "Coach workspace"}
      >
        {(["schedule", "classes", "students"] as const).map((id) => {
          const Icon = icons[id];
          return (
            <Link
              key={id}
              href={`/coach/${id === "students" ? "members" : id}`}
              aria-current={mode === id ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              {labels[id]}
            </Link>
          );
        })}
      </nav>
      <AsyncSection state={state}>
        {({ classes, sessions }) =>
          !classes.length ? (
            <Empty
              sport="Badminton"
              text={
                vi
                  ? "Chưa có lớp được phân công. Lịch dạy và học viên sẽ xuất hiện khi quản lý giao lớp."
                  : "No classes assigned yet. Your schedule and students appear when a manager assigns a class."
              }
            />
          ) : (
            <>
              {mode === "schedule" && (
                <section className={styles.calendar}>
                  <Calendar
                    date={date}
                    view={view}
                    onDateChange={(value) =>
                      setDate(view === "week" ? monday(value) : value)
                    }
                    onViewChange={(value) => {
                      setView(value);
                      if (value === "week") setDate(monday(date));
                    }}
                    events={sessions.map((s) => ({
                      id: s.sessionId,
                      title: s.className,
                      type: "CLASS_SESSION",
                      startAtUtc: s.startAtUtc,
                      endAtUtc: s.endAtUtc,
                      roomName: s.roomName,
                      status: s.status,
                    }))}
                    labels={{
                      day: vi ? "Ngày" : "Day",
                      week: vi ? "Tuần" : "Week",
                      list: vi ? "Danh sách" : "List",
                      previous: vi ? "Trước" : "Previous",
                      today: vi ? "Hôm nay" : "Today",
                      next: vi ? "Tiếp" : "Next",
                      empty: vi ? "Không có buổi dạy" : "No sessions",
                      eventDetails: vi ? "Xem buổi dạy" : "View session",
                      types: { CLASS_SESSION: vi ? "Lớp học" : "Class" },
                    }}
                    onSelectEvent={(e) => {
                      const session = sessions.find(
                        (s) => s.sessionId === e.id,
                      );
                      const course = classes.find(
                        (c) => c.classId === session?.classId,
                      );
                      if (session && course) setSelection({ course, session });
                    }}
                  />
                  <p className={styles.muted}>
                    {vi
                      ? "Chọn buổi học để soạn giáo án, điểm danh và ghi nhận kết quả."
                      : "Select a session to plan, take attendance and record results."}
                  </p>
                </section>
              )}
              {mode === "classes" && (
                <div className={styles.classGrid}>
                  {classes.map((course) => (
                    <button
                      className={styles.classCard}
                      type="button"
                      key={course.classId}
                      onClick={() => setSelection({ course })}
                    >
                      <div className={styles.cardTop}>
                        <span className={styles.badge}>{course.sportName}</span>
                        <StatusChip value={course.status} />
                      </div>
                      <CourseSticker sport={course.sportName} compact />
                      <h3>{course.name}</h3>
                      <p>
                        <MapPin size={16} aria-hidden="true" />
                        {course.roomName}
                      </p>
                      <span className={styles.cardBottom}>
                        {vi
                          ? "Học viên · giáo án · trao đổi"
                          : "Students · plans · communication"}
                        <ArrowRight size={18} aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {mode === "students" && (
                <section>
                  <div className={styles.filters}>
                    <label>
                      {vi ? "Lớp phụ trách" : "Assigned class"}
                      <select
                        value={classFilter || String(classes[0].classId)}
                        onChange={(e) => {
                          setClassFilter(e.target.value);
                          setSearch("");
                        }}
                      >
                        {classes.map((c) => (
                          <option key={c.classId} value={c.classId}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {vi ? "Tìm học viên" : "Find student"}
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={vi ? "Tên hoặc email" : "Name or email"}
                      />
                    </label>
                  </div>
                  <Students
                    key={classFilter || classes[0].classId}
                    course={
                      classes.find((c) => String(c.classId) === classFilter) ??
                      classes[0]
                    }
                    search={search}
                    onSelect={(member) =>
                      setSelection({
                        course:
                          classes.find(
                            (c) => String(c.classId) === classFilter,
                          ) ?? classes[0],
                        member,
                      })
                    }
                  />
                </section>
              )}
            </>
          )
        }
      </AsyncSection>
      {current && (
        <TeachingDetail
          key={`${current.course.classId}-${current.session?.sessionId ?? "class"}-${current.member?.memberId ?? "all"}`}
          selection={current}
          onClose={() => {
            setSelection(null);
            if (initial) router.push("/coach/classes");
          }}
        />
      )}
    </div>
  );
}

function Empty({ sport, text }: { sport: string; text: string }) {
  return (
    <div className={styles.empty}>
      <CourseSticker sport={sport} compact />
      <p>{text}</p>
    </div>
  );
}

function Students({
  course,
  search,
  onSelect,
}: {
  course: CourseDto;
  search: string;
  onSelect: (m: TeachingMember) => void;
}) {
  const state = useApi(
    (signal) => teachingApi.members(course.classId, signal),
    [course.classId],
  );
  const { language } = useLanguage();
  const vi = language === "vi";
  return (
    <AsyncSection state={state}>
      {(members) => (
        <div className={styles.studentList}>
          {members
            .filter((m) =>
              `${m.memberName} ${m.email}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            )
            .map((m) => (
              <button
                type="button"
                key={m.memberId}
                className={styles.student}
                onClick={() => onSelect(m)}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {m.memberName.slice(0, 1)}
                </span>
                <span>
                  <strong>{m.memberName}</strong>
                  <small>
                    {m.goal ||
                      (vi
                        ? "Chưa có mục tiêu tập luyện"
                        : "No training goal yet")}
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          {!members.length && (
            <Empty
              sport={course.sportName}
              text={
                vi
                  ? "Lớp chưa có học viên đăng ký."
                  : "No students enrolled yet."
              }
            />
          )}
          {members.length > 0 &&
            !members.some((m) =>
              `${m.memberName} ${m.email}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            ) && (
              <p>
                {vi
                  ? "Không tìm thấy học viên phù hợp."
                  : "No matching students."}
              </p>
            )}
        </div>
      )}
    </AsyncSection>
  );
}

function TeachingDetail({
  selection: { course, session, member },
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const vi = language === "vi";
  const now = useNow();
  const [tab, setTab] = useState(
    member ? "profile" : session ? "plans" : "students",
  );
  const [editor, setEditor] = useState<{
    kind: TeachingRecord["kind"];
    existing?: TeachingRecord;
    memberId?: string;
    sessionId?: string;
    scope?: PlanScope;
  } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const editorState = useRef({ dirty: false, busy: false });
  const discard = () =>
    !editorState.current.busy &&
    (!editorState.current.dirty ||
      window.confirm(
        vi
          ? "Nội dung chưa được lưu. Bỏ các thay đổi?"
          : "You have unsaved changes. Discard them?",
      ));
  const action = useAction();
  const state = useApi(
    async (signal) => {
      const [members, records, sessions, roster] = await Promise.all([
        teachingApi.members(course.classId, signal),
        teachingApi.records(course.classId, signal),
        ptApi.classSessions(course.classId, signal),
        session
          ? ptApi.roster(session.sessionId, signal)
          : Promise.resolve(null),
      ]);
      return { members, records, sessions, roster };
    },
    [course.classId, session?.sessionId],
  );
  const tabs = member
    ? [
        { id: "profile", label: vi ? "Hồ sơ & tiến độ" : "Profile & progress" },
        { id: "plans", label: vi ? "Kế hoạch tập luyện" : "Training plans" },
      ]
    : session
      ? [
          { id: "plans", label: vi ? "Giáo án" : "Lesson plan" },
          {
            id: "attendance",
            label: vi ? "Điểm danh & kết quả" : "Attendance & results",
          },
          { id: "communication", label: vi ? "Sau buổi học" : "After session" },
        ]
      : [
          {
            id: "students",
            label: vi ? "Học viên & lịch" : "Students & sessions",
          },
          { id: "plans", label: vi ? "Giáo án" : "Lesson plans" },
          { id: "communication", label: vi ? "Trao đổi" : "Communication" },
        ];
  const writable =
    !/cancel|draft/i.test(course.status) &&
    (session
      ? session.coachId === user?.userId && !/cancel/i.test(session.status)
      : course.coachId === user?.userId);
  const begin = (kind: TeachingRecord["kind"], memberId?: string) => {
    setSaved(null);
    setEditor({
      kind,
      memberId,
      scope: kind === "PLAN" && memberId ? "personal" : undefined,
    });
  };
  return (
    <Drawer
      size="lg"
      title={member?.memberName ?? course.name}
      description={
        session
          ? `${formatDateTime(session.startAtUtc)}–${formatTime(session.endAtUtc)} · ${session.roomName}`
          : course.sportName
      }
      onClose={() => {
        if (discard()) onClose();
      }}
    >
      <div className={styles.detail}>
        <Feedback error={action.error} success={saved ?? action.success} />
        <AsyncSection state={state}>
          {({ members, records, sessions, roster }) => {
            const scoped = records.filter(
              (r) =>
                (!session ||
                  r.sessionId === session.sessionId ||
                  (r.sessionId === null && r.kind === "PLAN")) &&
                (!member || r.memberId === member.memberId),
            );
            const profile =
              members.find((m) => m.memberId === member?.memberId) ?? member;
            const attendanceOpen =
              roster &&
              writable &&
              now >= Date.parse(roster.attendanceOpensAtUtc) &&
              now <= Date.parse(roster.attendanceClosesAtUtc);
            return editor ? (
              <TeachingEditor
                classId={course.classId}
                kind={editor.kind}
                members={members}
                sessions={sessions.filter((s) => s.coachId === user?.userId)}
                sessionId={
                  editor.existing
                    ? (editor.existing.sessionId ?? undefined)
                    : editor.kind === "PLAN"
                      ? editor.sessionId
                      : session?.sessionId
                }
                memberId={
                  editor.kind === "PLAN" && editor.scope !== "personal"
                    ? undefined
                    : (editor.memberId ?? member?.memberId)
                }
                planScope={editor.scope}
                existing={editor.existing}
                onStateChange={(value) => {
                  editorState.current = value;
                }}
                onClose={() => {
                  if (discard()) {
                    editorState.current = { dirty: false, busy: false };
                    setEditor(null);
                  }
                }}
                onSaved={() => {
                  editorState.current = { dirty: false, busy: false };
                  setEditor(null);
                  setSaved(vi ? "Đã lưu vào hệ thống." : "Saved to SportHub.");
                  state.reload();
                }}
              />
            ) : (
              <>
                <Tabs
                  value={tab}
                  onChange={setTab}
                  tabs={tabs}
                  ariaLabel={vi ? "Chi tiết giảng dạy" : "Teaching details"}
                >
                  {tab === "students" && (
                    <>
                      <div className={styles.studentList}>
                        {members.map((m) => (
                          <div className={styles.student} key={m.memberId}>
                            <span className={styles.avatar} aria-hidden="true">
                              {m.memberName.slice(0, 1)}
                            </span>
                            <div>
                              <strong>{m.memberName}</strong>
                              <small>{m.email}</small>
                              <p>
                                {m.goal ||
                                  (vi ? "Chưa có mục tiêu" : "No goal yet")}
                              </p>
                              <small>
                                {m.experienceLevel} ·{" "}
                                {vi ? "Có mặt" : "Present"} {m.present} ·{" "}
                                {vi ? "Vắng" : "Absent"} {m.absent}
                              </small>
                            </div>
                            {writable && (
                              <button
                                className="btn btn--secondary btn--sm"
                                type="button"
                                onClick={() => begin("PLAN", m.memberId)}
                              >
                                {vi ? "Lập kế hoạch" : "Plan"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <h3>{vi ? "Lịch các buổi học" : "Sessions"}</h3>
                      {sessions.map((s) => (
                        <p className={styles.sessionLine} key={s.sessionId}>
                          <CalendarDays size={16} aria-hidden="true" />
                          {formatDateTime(s.startAtUtc)} · {s.roomName}
                          <StatusChip value={s.status} />
                        </p>
                      ))}
                    </>
                  )}
                  {tab === "profile" && profile && (
                    <>
                      <div className={styles.profile}>
                        <Target aria-hidden="true" size={24} />
                        <div>
                          <h3>{vi ? "Mục tiêu tập luyện" : "Training goal"}</h3>
                          <p>
                            {profile.goal ||
                              (vi
                                ? "Học viên chưa cung cấp mục tiêu."
                                : "No goal provided yet.")}
                          </p>
                          <small>
                            {profile.email} ·{" "}
                            {profile.experienceLevel ||
                              (vi
                                ? "Chưa có trình độ"
                                : "Experience not provided")}
                          </small>
                          {profile.notes && <p>{profile.notes}</p>}
                          <p>
                            {vi ? "Có mặt" : "Present"}{" "}
                            <strong>{profile.present}</strong> ·{" "}
                            {vi ? "Vắng" : "Absent"}{" "}
                            <strong>{profile.absent}</strong>
                          </p>
                        </div>
                      </div>
                      <h3>
                        {vi
                          ? "Lịch sử kết quả & nhận xét"
                          : "Results & feedback history"}
                      </h3>
                      <TeachingRecords
                        records={scoped.filter((r) => r.kind === "RESULT")}
                        members={members}
                        editableCoachId={user?.userId}
                      />
                    </>
                  )}
                  {tab === "plans" && (
                    <TrainingPlanView
                      records={records.filter(
                        (r) =>
                          r.kind === "PLAN" &&
                          (!member ||
                            r.memberId === member.memberId ||
                            r.memberId === null),
                      )}
                      members={members}
                      sessions={sessions}
                      sessionId={session?.sessionId}
                      memberId={member?.memberId}
                      editableCoachId={user?.userId}
                      onCreate={
                        writable
                          ? (scope, selectedSession, selectedMember) => {
                              setSaved(null);
                              setEditor({
                                kind: "PLAN",
                                scope,
                                sessionId: selectedSession,
                                memberId: selectedMember,
                              });
                            }
                          : undefined
                      }
                      onEdit={
                        writable
                          ? (r) => {
                              if (r.coachId === user?.userId)
                                setEditor({ kind: r.kind, existing: r });
                            }
                          : undefined
                      }
                    />
                  )}
                  {tab === "attendance" && roster && (
                    <>
                      <p className={styles.muted}>
                        {vi
                          ? "Điểm danh trong buổi học và đến 24 giờ sau khi kết thúc."
                          : "Attendance opens at session start and closes 24 hours after it ends."}
                      </p>
                      <div className={styles.studentList}>
                        {roster.entries
                          .filter((e) => e.enrollmentStatus === "CONFIRMED")
                          .map((entry) => {
                            const result = records.find(
                              (r) =>
                                r.kind === "RESULT" &&
                                r.sessionId === session?.sessionId &&
                                r.memberId === entry.memberId,
                            );
                            return (
                              <div
                                className={styles.attendanceRow}
                                key={entry.enrollmentId}
                              >
                                <div>
                                  <strong>{entry.memberName}</strong>
                                  <small>
                                    {entry.attendanceStatus
                                      ? /present/i.test(entry.attendanceStatus)
                                        ? vi
                                          ? "Có mặt"
                                          : "Present"
                                        : vi
                                          ? "Vắng mặt"
                                          : "Absent"
                                      : vi
                                        ? "Chưa điểm danh"
                                        : "Not marked"}
                                    {result
                                      ? ` · ${result.title}${result.score ? ` · ${result.score}/5` : ""}`
                                      : ""}
                                  </small>
                                </div>
                                <div className={styles.rowActions}>
                                  <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    aria-pressed={/present/i.test(
                                      entry.attendanceStatus ?? "",
                                    )}
                                    disabled={!attendanceOpen || action.busy}
                                    onClick={async () => {
                                      const response = await action.run(
                                        () =>
                                          teachingApi.attendance(
                                            session!.sessionId,
                                            entry.enrollmentId,
                                            "PRESENT",
                                          ),
                                        vi
                                          ? "Đã lưu điểm danh."
                                          : "Attendance saved.",
                                      );
                                      if (response !== null) state.reload();
                                    }}
                                  >
                                    <Check size={16} aria-hidden="true" />
                                    {vi ? "Có mặt" : "Present"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    aria-pressed={/absent/i.test(
                                      entry.attendanceStatus ?? "",
                                    )}
                                    disabled={!attendanceOpen || action.busy}
                                    onClick={async () => {
                                      const response = await action.run(
                                        () =>
                                          teachingApi.attendance(
                                            session!.sessionId,
                                            entry.enrollmentId,
                                            "ABSENT",
                                          ),
                                        vi
                                          ? "Đã lưu điểm danh."
                                          : "Attendance saved.",
                                      );
                                      if (response !== null) state.reload();
                                    }}
                                  >
                                    <X size={16} aria-hidden="true" />
                                    {vi ? "Vắng" : "Absent"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--quiet btn--sm"
                                    disabled={
                                      !writable ||
                                      now < Date.parse(session!.startAtUtc) ||
                                      (!!result &&
                                        result.coachId !== user?.userId)
                                    }
                                    onClick={() =>
                                      result
                                        ? setEditor({
                                            kind: "RESULT",
                                            existing: result,
                                          })
                                        : begin("RESULT", entry.memberId)
                                    }
                                  >
                                    {result
                                      ? vi
                                        ? "Sửa nhận xét"
                                        : "Edit assessment"
                                      : vi
                                        ? "Ghi kết quả"
                                        : "Record result"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {!roster.entries.length && (
                        <Empty
                          sport={course.sportName}
                          text={
                            vi
                              ? "Chưa có học viên trong buổi này."
                              : "No students in this session."
                          }
                        />
                      )}
                    </>
                  )}
                  {tab === "communication" && (
                    <>
                      <div className={styles.rowActions}>
                        {writable && (
                          <>
                            <button
                              className="btn btn--sm"
                              type="button"
                              onClick={() => begin("HOMEWORK")}
                            >
                              <Plus size={16} aria-hidden="true" />
                              {vi ? "Giao bài tập" : "Assign homework"}
                            </button>
                            <button
                              className="btn btn--secondary btn--sm"
                              type="button"
                              onClick={() => begin("NOTICE")}
                            >
                              {vi ? "Gửi thông báo" : "Send notice"}
                            </button>
                          </>
                        )}
                      </div>
                      <TeachingRecords
                        records={scoped.filter(
                          (r) => r.kind === "HOMEWORK" || r.kind === "NOTICE",
                        )}
                        members={members}
                      />
                    </>
                  )}
                </Tabs>
                {!writable && (
                  <p className={styles.muted}>
                    {vi
                      ? "Bạn đang xem nội dung. Chỉ coach được phân công mới có thể cập nhật."
                      : "Read only. Only the assigned coach can update this content."}
                  </p>
                )}
                <div className={styles.detailSticker} aria-hidden="true">
                  <CourseSticker sport={course.sportName} compact />
                </div>
              </>
            );
          }}
        </AsyncSection>
      </div>
    </Drawer>
  );
}
