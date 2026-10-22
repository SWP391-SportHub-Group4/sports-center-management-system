"use client";
import { TableFilters } from "@/components/data/TableFilters";

import { useRouter } from "next/navigation";
import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  Plus,
  Check,
  X,
  ArrowRight,
  Bell,
  ClipboardPen,
  ClipboardCheck,
} from "lucide-react";
import { Drawer, Tabs } from "@/components/primitives";
import { AvatarImage } from "@/components/AvatarImage";
import { Calendar } from "@/components/scheduling/Calendar";
import { AsyncSection, Feedback } from "@/components/ui";
import { CourseSticker } from "@/features/courses";
import { useApi, useNow } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/apiClient";
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
import { StudentCurrentAssessments } from "./student-current-assessments";
import { TrainingPlanView, type PlanScope } from "./training-plan-view";
import styles from "./coach-workspace.module.css";
import { CoachClassChanges } from "./coach-class-change";
import { ClassStudents } from "./class-students";
import { StudentPhysicalProfile } from "./student-physical-profile";
import { ClassDirectory } from "./class-directory";
import { useCoachAccess } from "./use-coach-access";

export type WorkspaceMode = "schedule" | "classes" | "students";
type Selection = {
  course: CourseDto;
  session?: CourseSessionDto;
  member?: TeachingMember;
};
type AttendanceStatus = "PRESENT" | "ABSENT";
type AttendanceUpdate = {
  status?: AttendanceStatus;
  pending?: AttendanceStatus;
  error?: string;
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
  const router = useRouter();
  const { user } = useAuth();
  const vi = false; // English-only presentation
  const [date, setDate] = useState(() => monday());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [sportFilter, setSportFilter] = useState("");
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
      return {
        classes:
          mode === "schedule"
            ? classes
            : classes.filter((c) => c.coachId === user?.userId),
        sessions,
      };
    },
    [user?.userId, mode],
  );
  const initial = state.data?.classes.find((c) => c.classId === initialClassId);
  const current = selection ?? (initial ? { course: initial } : null);
  return (
    <div className={styles.workspace}>
      <header className={styles.intro}>
        <div>
          {mode !== "classes" && (
            <span className={styles.eyebrow}>
              {vi ? "KHÔNG GIAN HUẤN LUYỆN" : "COACH WORKSPACE"}
            </span>
          )}
          <h2>
            {mode === "schedule"
              ? vi
                ? "Sẵn sàng cho buổi dạy"
                : "Ready for your next session"
              : mode === "classes"
                ? vi
                  ? "Lớp học của bạn"
                  : "Your classes"
                : vi
                  ? "Theo dõi tiến bộ học viên"
                  : "Follow your students’ progress"}
          </h2>
          <p>
            {mode === "classes"
              ? "Choose a class to manage students, plans and notices. See your next lesson at a glance."
              : vi
                ? "Từ buổi học đến tiến bộ của từng học viên. Mọi thao tác trong cùng một không gian."
                : "From each session to each student’s progress. Your teaching tools in one place."}
          </p>
        </div>
        {mode !== "classes" && (
          <CourseSticker
            sport={state.data?.classes[0]?.sportName ?? "Badminton"}
            compact
          />
        )}
      </header>
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
                    view="week"
                    showViewSwitcher={false}
                    iconNavigation
                    onDateChange={(value) => setDate(monday(value))}
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
                <ClassDirectory classes={classes} sessions={sessions} />
              )}
              {mode === "students" && (
                <section>
                  <TableFilters>
                    <div className={styles.filters}>
                      <label>
                        {vi ? "Chọn môn" : "Choose sport"}
                        <select
                          value={sportFilter}
                          onChange={(e) => {
                            setSportFilter(e.target.value);
                            setClassFilter("");
                            setSearch("");
                            setSelection(null);
                          }}
                        >
                          <option value="">
                            {vi ? "Chọn bộ môn" : "Select a sport"}
                          </option>
                          {Array.from(
                            new Map(
                              classes.map((c) => [c.sportId, c.sportName]),
                            ).entries(),
                          ).map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {vi ? "Chọn lớp" : "Choose class"}
                        <select
                          value={classFilter}
                          disabled={!sportFilter}
                          onChange={(e) => {
                            setClassFilter(e.target.value);
                            setSearch("");
                            setSelection(null);
                          }}
                        >
                          <option value="">
                            {vi ? "Chọn lớp học" : "Select a class"}
                          </option>
                          {classes
                            .filter((c) => String(c.sportId) === sportFilter)
                            .map((c) => (
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
                          disabled={!classFilter}
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={vi ? "Tên hoặc email" : "Name or email"}
                        />
                      </label>
                    </div>
                  </TableFilters>
                  {classes.find(
                    (c) =>
                      String(c.classId) === classFilter &&
                      String(c.sportId) === sportFilter,
                  ) ? (
                    <Students
                      key={classFilter || classes[0].classId}
                      course={
                        classes.find(
                          (c) => String(c.classId) === classFilter,
                        ) ?? classes[0]
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
                  ) : (
                    <Empty
                      sport={
                        classes.find((c) => String(c.sportId) === sportFilter)
                          ?.sportName ?? "Badminton"
                      }
                      text={
                        vi
                          ? "Chọn môn và lớp để xem đúng danh sách học viên."
                          : "Choose a sport and class to view its students."
                      }
                    />
                  )}
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
  const vi = false; // English-only presentation
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
                <AvatarImage name={m.memberName} size={40} />
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

function TeachingDetailSections({
  hideNavigation,
  ...props
}: ComponentProps<typeof Tabs> & { hideNavigation: boolean }) {
  return hideNavigation ? (
    <section aria-label={props.ariaLabel}>{props.children}</section>
  ) : (
    <Tabs {...props} />
  );
}

export function TeachingDetail({
  selection: { course, session, member },
  onClose,
  fullPage = false,
  onEditingStateChange,
  initialTab,
  hideHeading = false,
  hideNavigation = false,
}: {
  selection: Selection;
  onClose: () => void;
  fullPage?: boolean;
  onEditingStateChange?: (state: { dirty: boolean; busy: boolean }) => void;
  initialTab?: "students" | "plans" | "feedback";
  hideHeading?: boolean;
  hideNavigation?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const vi = false; // English-only presentation
  const now = useNow();
  const [tab, setTab] = useState(
    initialTab ?? (member ? "profile" : session ? "plans" : "students"),
  );
  const [editor, setEditor] = useState<{
    kind: TeachingRecord["kind"];
    existing?: TeachingRecord;
    memberId?: string;
    sessionId?: string;
    scope?: PlanScope;
  } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [attendanceUpdates, setAttendanceUpdates] = useState<
    Record<string, AttendanceUpdate>
  >({});
  const pendingAttendance = useRef(new Set<string>());
  const editorState = useRef({ dirty: false, busy: false });
  const discard = () =>
    !editorState.current.busy &&
    (!editorState.current.dirty ||
      window.confirm(
        vi
          ? "Nội dung chưa được lưu. Bỏ các thay đổi?"
          : "You have unsaved changes. Discard them?",
      ));
  async function markAttendance(
    sessionId: string,
    enrollmentId: string,
    status: AttendanceStatus,
  ) {
    const key = `${sessionId}:${enrollmentId}`;
    if (pendingAttendance.current.has(key)) return;
    pendingAttendance.current.add(key);
    setAttendanceUpdates((current) => ({
      ...current,
      [key]: { ...current[key], pending: status, error: undefined },
    }));
    try {
      await teachingApi.attendance(sessionId, enrollmentId, status);
      setAttendanceUpdates((current) => ({ ...current, [key]: { status } }));
    } catch (error) {
      setAttendanceUpdates((current) => ({
        ...current,
        [key]: {
          ...current[key],
          pending: undefined,
          error:
            error instanceof Error
              ? error.message
              : "Attendance could not be saved. Please try again.",
        },
      }));
    } finally {
      pendingAttendance.current.delete(key);
    }
  }
  const state = useApi(
    async (signal) => {
      const [members, records, sessions, roster] = await Promise.all([
        teachingApi.members(
          course.classId,
          signal,
          member?.memberId,
          session?.sessionId,
        ),
        teachingApi.records(
          course.classId,
          signal,
          false,
          member?.memberId,
          session?.sessionId,
        ),
        ptApi.classSessions(course.classId, signal),
        session
          ? ptApi.roster(session.sessionId, signal)
          : Promise.resolve(null),
      ]);
      return {
        members,
        records,
        sessions: [...sessions].sort(
          (a, b) =>
            a.sessionNo - b.sessionNo ||
            a.startAtUtc.localeCompare(b.startAtUtc),
        ),
        roster,
      };
    },
    [course.classId, session?.sessionId, member?.memberId],
  );
  const tabs = member
    ? [
        { id: "profile", label: vi ? "Hồ sơ" : "Profile" },
        { id: "plans", label: vi ? "Kế hoạch" : "Plans" },
        { id: "feedback", label: "Progress" },
      ]
    : session
      ? [
          { id: "plans", label: vi ? "Giáo án" : "Plan" },
          {
            id: "attendance",
            label: vi ? "Điểm danh" : "Attendance",
          },
          { id: "communication", label: vi ? "Bài tập" : "Homework" },
          {
            id: "changes",
            label: vi ? "Yêu cầu" : "Request",
          },
        ]
      : [
          {
            id: "students",
            label: vi ? "Học viên" : "Students",
          },
          { id: "plans", label: vi ? "Giáo án" : "Plans" },
          { id: "communication", label: vi ? "Thông báo" : "Notices" },
        ];
  const writable =
    !/cancel|draft|completed/i.test(course.status) &&
    (session
      ? session.coachId === user?.userId && !/cancel/i.test(session.status)
      : course.coachId === user?.userId);
  const substitute = !!user && course.coachId !== user.userId;
  const revoked = useCoachAccess(
    async (signal) => {
      const currentMembers = await teachingApi.members(
        course.classId,
        signal,
        member?.memberId,
        session?.sessionId,
      );
      if (
        state.data?.members.some(
          (previous) =>
            !currentMembers.some(
              (current) => current.memberId === previous.memberId,
            ),
        )
      )
        throw new ApiError(
          403,
          "student_access_changed",
          "Student access has changed. Reopen the session to refresh its students.",
        );
      return currentMembers;
    },
    `${course.classId}:${session?.sessionId ?? ""}:${member?.memberId ?? ""}`,
  );
  const begin = (kind: TeachingRecord["kind"], memberId?: string) => {
    setSaved(null);
    setEditor({
      kind,
      memberId,
      scope: kind === "PLAN" && memberId ? "personal" : undefined,
    });
  };
  if (revoked)
    return (
      <p role="status">
        Access is no longer available.{" "}
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          Close
        </button>
      </p>
    );
  return (
    <TeachingDetailFrame
      fullPage={fullPage}
      hideHeading={hideHeading}
      title={fullPage ? course.name : (member?.memberName ?? course.name)}
      description={
        session
          ? `${formatDateTime(session.startAtUtc)}–${formatTime(session.endAtUtc)} · ${session.roomName}`
          : fullPage
            ? course.sportName
            : `${course.sportName} · ${course.name}`
      }
      onClose={() => {
        if (discard()) onClose();
      }}
    >
      <div className={styles.detail}>
        {substitute && (
          <p className={styles.muted}>
            Substitute · Access is limited to this session.
          </p>
        )}
        <Feedback success={saved} />
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
            const hasAttendanceEntries =
              roster?.entries.some(
                (entry) => entry.enrollmentStatus === "CONFIRMED",
              ) ?? false;
            const attendanceOpen =
              roster &&
              writable &&
              now >= Date.parse(roster.attendanceOpensAtUtc) &&
              now <= Date.parse(roster.attendanceClosesAtUtc);
            const homeworkOpen =
              !!session && writable && now >= Date.parse(session.endAtUtc);
            return editor ? (
              <TeachingEditor
                sessionOnly={substitute}
                classId={course.classId}
                kind={editor.kind}
                members={members}
                sessions={sessions.filter(
                  (s) =>
                    s.coachId === user?.userId &&
                    (!substitute || s.sessionId === session?.sessionId),
                )}
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
                lockedMemberId={member?.memberId}
                onStateChange={(value) => {
                  editorState.current = value;
                  onEditingStateChange?.(value);
                }}
                onClose={() => {
                  if (discard()) {
                    editorState.current = { dirty: false, busy: false };
                    onEditingStateChange?.(editorState.current);
                    setEditor(null);
                  }
                }}
                onSaved={() => {
                  editorState.current = { dirty: false, busy: false };
                  onEditingStateChange?.(editorState.current);
                  setEditor(null);
                  setSaved(vi ? "Đã lưu vào hệ thống." : "Saved to SportHub.");
                  state.reload();
                }}
              />
            ) : (
              <>
                <TeachingDetailSections
                  hideNavigation={hideNavigation}
                  value={tab}
                  onChange={(next) => {
                    if (discard()) {
                      editorState.current = { dirty: false, busy: false };
                      setTab(next);
                    }
                  }}
                  tabs={tabs}
                  ariaLabel={vi ? "Chi tiết giảng dạy" : "Teaching details"}
                >
                  {tab === "students" && (
                    <ClassStudents
                      members={members}
                      onPlan={
                        writable
                          ? (memberId) => begin("PLAN", memberId)
                          : undefined
                      }
                    />
                  )}
                  {tab === "profile" && profile && (
                    <StudentPhysicalProfile memberId={profile.memberId} />
                  )}
                  {tab === "feedback" &&
                    member &&
                    (hideNavigation ? (
                      <StudentCurrentAssessments
                        className={course.name}
                        records={scoped}
                        sessions={sessions}
                      />
                    ) : (
                      <>
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
                    ))}
                  {tab === "plans" && (
                    <>
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
                        viewMode={session && !member ? "session" : undefined}
                        onViewCoursePlan={
                          !substitute && (member || session)
                            ? () =>
                                router.push(
                                  `/coach/classes/${course.classId}?tab=plans`,
                                )
                            : undefined
                        }
                        memberId={member?.memberId}
                        editableCoachId={user?.userId}
                        onCreate={
                          writable
                            ? (scope, selectedSession, selectedMember) => {
                                if (member && scope !== "personal") return;
                                setSaved(null);
                                setEditor({
                                  kind: "PLAN",
                                  scope,
                                  sessionId: substitute
                                    ? session?.sessionId
                                    : selectedSession,
                                  memberId: member?.memberId ?? selectedMember,
                                });
                              }
                            : undefined
                        }
                        onEdit={
                          writable
                            ? (r) => {
                                if (
                                  r.coachId === user?.userId &&
                                  (!member || r.memberId === member.memberId)
                                )
                                  setEditor({ kind: r.kind, existing: r });
                              }
                            : undefined
                        }
                      />
                    </>
                  )}
                  {tab === "attendance" && roster && (
                    <>
                      <p className={styles.muted}>
                        {vi
                          ? "Điểm danh từ 5 phút trước giờ bắt đầu đến 24 giờ sau khi kết thúc."
                          : "Attendance opens 5 minutes before the session starts and closes 24 hours after it ends."}
                      </p>
                      <div className={styles.studentList}>
                        {roster.entries
                          .filter((e) => e.enrollmentStatus === "CONFIRMED")
                          .map((entry) => {
                            const update =
                              attendanceUpdates[
                                `${session?.sessionId}:${entry.enrollmentId}`
                              ];
                            const attendanceStatus =
                              update?.status ??
                              entry.attendanceStatus?.toUpperCase();
                            const statusLabel =
                              attendanceStatus === "PRESENT"
                                ? "Present"
                                : attendanceStatus === "ABSENT"
                                  ? "Absent"
                                  : "Not marked";
                            const result = records.find(
                              (r) =>
                                r.kind === "RESULT" &&
                                r.sessionId === session?.sessionId &&
                                r.memberId === entry.memberId,
                            );
                            const recordAttendanceReason = update?.pending
                              ? "Wait for attendance to finish saving."
                              : attendanceStatus === "ABSENT"
                                ? "Results are only available for students marked Present."
                                : attendanceStatus !== "PRESENT"
                                  ? "Mark this student Present before recording a result."
                                  : null;
                            return (
                              <div
                                className={styles.attendanceRow}
                                key={entry.enrollmentId}
                              >
                                <div>
                                  <strong>{entry.memberName}</strong>
                                  <div
                                    className={styles.attendanceFeedback}
                                    role="status"
                                    aria-live="polite"
                                    aria-atomic="true"
                                  >
                                    <span
                                      className={styles.attendanceStatus}
                                      data-status={
                                        attendanceStatus ?? "UNMARKED"
                                      }
                                    >
                                      {statusLabel}
                                    </span>
                                    {update?.pending ? (
                                      <span
                                        className={styles.attendanceReceipt}
                                      >
                                        Saving{" "}
                                        {update.pending === "PRESENT"
                                          ? "Present"
                                          : "Absent"}{" "}
                                        for {entry.memberName}…
                                      </span>
                                    ) : null}
                                  </div>
                                  {update?.error && (
                                    <p
                                      className={styles.attendanceError}
                                      role="alert"
                                    >
                                      Could not update {entry.memberName}.{" "}
                                      {update.error}
                                    </p>
                                  )}
                                  {recordAttendanceReason && (
                                    <small>{recordAttendanceReason}</small>
                                  )}
                                  {result && (
                                    <small>
                                      {result.title}
                                      {result.score
                                        ? ` · ${result.score}/5`
                                        : ""}
                                    </small>
                                  )}
                                  {result && (
                                    <span className={styles.recordSaved}>
                                      <Check size={14} aria-hidden="true" />
                                      {vi ? "Đã ghi kết quả" : "Recorded"}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={styles.rowActions}
                                  role="group"
                                  aria-label={`Attendance and results for ${entry.memberName}`}
                                >
                                  <button
                                    type="button"
                                    className={`btn btn--sm ${styles.attendanceButton}`}
                                    data-attendance="present"
                                    aria-busy={update?.pending === "PRESENT"}
                                    aria-pressed={
                                      attendanceStatus === "PRESENT"
                                    }
                                    disabled={
                                      !attendanceOpen || !!update?.pending
                                    }
                                    onClick={() =>
                                      void markAttendance(
                                        session!.sessionId,
                                        entry.enrollmentId,
                                        "PRESENT",
                                      )
                                    }
                                  >
                                    <Check size={16} aria-hidden="true" />
                                    {vi ? "Có mặt" : "Present"}
                                    {attendanceStatus === "PRESENT" && (
                                      <span
                                        className={styles.attendanceSelected}
                                        aria-hidden="true"
                                      >
                                        Selected
                                      </span>
                                    )}
                                    {update?.pending === "PRESENT" &&
                                      " · Saving…"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn--sm ${styles.attendanceButton}`}
                                    data-attendance="absent"
                                    title={
                                      result
                                        ? "This student already has a session result. Attendance cannot be changed to Absent."
                                        : undefined
                                    }
                                    aria-busy={update?.pending === "ABSENT"}
                                    aria-pressed={attendanceStatus === "ABSENT"}
                                    disabled={
                                      !attendanceOpen ||
                                      !!update?.pending ||
                                      !!result
                                    }
                                    onClick={() =>
                                      void markAttendance(
                                        session!.sessionId,
                                        entry.enrollmentId,
                                        "ABSENT",
                                      )
                                    }
                                  >
                                    <X size={16} aria-hidden="true" />
                                    {vi ? "Vắng" : "Absent"}
                                    {attendanceStatus === "ABSENT" && (
                                      <span
                                        className={styles.attendanceSelected}
                                        aria-hidden="true"
                                      >
                                        Selected
                                      </span>
                                    )}
                                    {update?.pending === "ABSENT" &&
                                      " · Saving…"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn--secondary ${styles.recordButton}`}
                                    title={
                                      recordAttendanceReason ??
                                      (result
                                        ? vi
                                          ? "Xem và chỉnh sửa kết quả đã ghi"
                                          : "View and edit the saved result"
                                        : vi
                                          ? "Ghi kết quả buổi học"
                                          : "Record this session’s result")
                                    }
                                    disabled={
                                      !writable ||
                                      !!recordAttendanceReason ||
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
                                    {result ? (
                                      <ClipboardCheck
                                        size={18}
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <ClipboardPen
                                        size={18}
                                        aria-hidden="true"
                                      />
                                    )}
                                    Record
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {!hasAttendanceEntries && (
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
                      {!session && (
                        <header className={styles.noticeIntro}>
                          <div className={styles.noticeTitle}>
                            <Bell size={20} aria-hidden="true" />
                            <h3>Class notices</h3>
                          </div>
                          <p>
                            Send reminders or announcements to the whole class
                            or a specific student. Recipients receive a bell
                            notification.
                          </p>
                        </header>
                      )}
                      {session && (
                        <p className={styles.muted}>
                          {homeworkOpen
                            ? vi
                              ? "Giao bài tập ôn luyện cho buổi vừa kết thúc. Nên hoàn thành trước buổi tiếp theo — không bắt buộc."
                              : "Assign practice for the lesson that just ended. Aim to complete it before the next lesson — optional."
                            : vi
                              ? "Chỉ có thể giao bài tập sau khi buổi học kết thúc."
                              : "Homework can be assigned once this session ends."}
                        </p>
                      )}
                      <div className={styles.rowActions}>
                        {writable && (
                          <>
                            {session ? (
                              <button
                                className="btn btn--sm"
                                type="button"
                                onClick={() => begin("HOMEWORK")}
                                disabled={!homeworkOpen}
                              >
                                <Plus size={16} aria-hidden="true" />
                                {vi ? "Giao bài tập" : "Assign homework"}
                              </button>
                            ) : (
                              <button
                                className="btn btn--secondary btn--sm"
                                type="button"
                                onClick={() => begin("NOTICE")}
                              >
                                {vi ? "Gửi thông báo" : "Send notice"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <TeachingRecords
                        records={scoped.filter(
                          (r) => r.kind === (session ? "HOMEWORK" : "NOTICE"),
                        )}
                        members={members}
                      />
                    </>
                  )}
                  {session && tab === "changes" && (
                    <CoachClassChanges
                      key={session.sessionId}
                      session={session}
                      onChanged={() => state.reload()}
                      onStateChange={(value) => {
                        editorState.current = value;
                      }}
                    />
                  )}
                </TeachingDetailSections>
                {!writable && (
                  <p className={styles.muted}>
                    {vi
                      ? "Bạn đang xem nội dung. Chỉ coach được phân công mới có thể cập nhật."
                      : "Read only. Only the assigned coach can update this content."}
                  </p>
                )}
                {!fullPage &&
                  !(
                    tab === "attendance" &&
                    roster &&
                    !hasAttendanceEntries
                  ) && (
                    <div className={styles.detailSticker} aria-hidden="true">
                      <CourseSticker sport={course.sportName} compact />
                    </div>
                  )}
              </>
            );
          }}
        </AsyncSection>
      </div>
    </TeachingDetailFrame>
  );
}

function TeachingDetailFrame({
  fullPage,
  hideHeading,
  title,
  description,
  onClose,
  children,
}: {
  fullPage: boolean;
  hideHeading: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!fullPage)
    return (
      <Drawer
        size="xl"
        title={title}
        description={description}
        onClose={onClose}
      >
        {children}
      </Drawer>
    );
  return (
    <section className={styles.fullStudentDetail}>
      {!hideHeading && (
        <header className={styles.sectionHeader}>
          <div>
            <h2>{title}</h2>
            <p className={styles.muted}>{description}</p>
          </div>
        </header>
      )}
      {children}
    </section>
  );
}
