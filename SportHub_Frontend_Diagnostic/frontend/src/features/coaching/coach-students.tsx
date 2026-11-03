"use client";
import { TableFilters } from "@/components/data/TableFilters";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  HeartPulse,
  History,
  Search,
  Users,
} from "lucide-react";
import { AsyncSection, Pager } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { teachingApi, type TeachingStudent } from "./teaching-api";
import { ptApi } from "./api";
import { TeachingDetail } from "./coach-workspace";
import { StudentLearningHistory } from "./student-assessment-history";
import { StudentCurrentAssessments } from "./student-current-assessments";
import { StudentPhysicalProfile } from "./student-physical-profile";
import { useCoachAccess } from "./use-coach-access";
import styles from "./coach-students.module.css";

export function CoachStudentDirectory() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("");
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      teachingApi.students(
        page,
        search,
        sport ? Number(sport) : undefined,
        signal,
      ),
    [page, search, sport],
  );
  // Keep sport options visible while the directory reloads for a new filter.
  const sports = useApi(
    (signal) => teachingApi.students(1, "", undefined, signal),
    [],
  );
  return (
    <div className={styles.workspace}>
      <section className={styles.directoryPanel} aria-label="Student directory">
        <header className={styles.directoryHeading}>
          <span className={styles.directoryEmblem}>
            <Users size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>{vi ? "Danh sách học viên" : "Student directory"}</h2>
            <p>
              {vi
                ? "Chọn học viên để xem hồ sơ sức khỏe, kế hoạch học và đánh giá."
                : "Health profiles, plans and assessments in one place."}
            </p>
          </div>
        </header>
        <div className={styles.directoryToolbar}>
          <div className={styles.filters}>
            <label>
              {vi ? "Tìm học viên" : "Find a student"}
              <span className={styles.search}>
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  maxLength={150}
                  placeholder={vi ? "Tên hoặc email" : "Name or email"}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </span>
            </label>
            <label>
              {vi ? "Bộ môn" : "Sport"}
              <select
                value={sport}
                onChange={(e) => {
                  setSport(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{vi ? "Tất cả bộ môn" : "All sports"}</option>
                {sports.data?.sports.map((s) => (
                  <option key={s.sportId} value={s.sportId}>
                    {s.sportName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <AsyncSection state={state}>
          {(data) => (
            <>
              <div className={styles.directorySummary}>
                <p className={styles.count} role="status">
                  {data.totalCount > 0 &&
                    `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.totalCount)} of `}
                  {data.totalCount}{" "}
                  {vi
                    ? "học viên"
                    : data.totalCount === 1
                      ? "student"
                      : "students"}
                </p>
                <span>{vi ? "10 học viên / trang" : "10 per page"}</span>
              </div>
              {data.items.length > 0 && (
                <div className={styles.directoryLabels} aria-hidden="true">
                  <span>Student</span>
                  <span>Current classes</span>
                  <span>Sport</span>
                  <span />
                </div>
              )}
              <ul className={styles.directory} aria-label="Students">
                {data.items.map((student) => (
                  <li key={student.memberId}>
                    <Link
                      href={`/coach/members/${student.memberId}`}
                      className={styles.student}
                    >
                      <span className={styles.studentIdentity}>
                        <UserAvatar
                          userId={student.memberId}
                          name={student.memberName}
                          size={44}
                        />
                        <span className={styles.studentInfo}>
                          <strong>{student.memberName}</strong>
                          <small title={student.email}>{student.email}</small>
                        </span>
                      </span>
                      <span className={styles.classInfo}>
                        <span className={styles.classCount}>
                          {student.classes.length}{" "}
                          <small>
                            {vi
                              ? "lớp"
                              : student.classes.length === 1
                                ? "class"
                                : "classes"}
                          </small>
                        </span>
                        <small className={styles.classNames}>
                          {student.classes.map((c) => c.className).join(" · ")}
                        </small>
                      </span>
                      <span className={styles.sportTags}>
                        {Array.from(
                          new Set(student.classes.map((c) => c.sportName)),
                        ).map((name) => (
                          <span key={name}>{name}</span>
                        ))}
                      </span>
                      <span className={styles.classView}>
                        <span>{vi ? "Xem hồ sơ" : "View profile"}</span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {!data.items.length && (
                <div className={styles.empty}>
                  <Users size={32} aria-hidden="true" />
                  <h3>
                    {vi ? "Không có học viên phù hợp" : "No matching students"}
                  </h3>
                  <p>
                    {vi
                      ? "Danh sách gồm học viên thuộc các lớp bạn đang được phân công."
                      : "This directory includes students in your currently assigned classes."}
                  </p>
                  {(search || sport) && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => {
                        setSearch("");
                        setSport("");
                        setPage(1);
                      }}
                    >
                      {vi ? "Xóa bộ lọc" : "Clear filters"}
                    </button>
                  )}
                </div>
              )}
              {data.totalCount > data.pageSize && (
                <div className={styles.directoryPagination}>
                  <Pager
                    page={data.page}
                    pageSize={data.pageSize}
                    totalCount={data.totalCount}
                    onChange={setPage}
                    noun={vi ? "học viên" : "students"}
                  />
                </div>
              )}
            </>
          )}
        </AsyncSection>
      </section>
    </div>
  );
}

export function CoachStudentProfile({ memberId }: { memberId: string }) {
  const revoked = useCoachAccess(
    (signal) => teachingApi.student(memberId, signal),
    memberId,
  );
  const state = useApi(
    (signal) => teachingApi.student(memberId, signal),
    [memberId],
  );
  if (revoked)
    return (
      <p role="status">
        Access is no longer available.{" "}
        <Link href="/coach/members">Back to students</Link>
      </p>
    );
  return (
    <AsyncSection state={state}>
      {(student) => <StudentProfileContent key={memberId} student={student} />}
    </AsyncSection>
  );
}

function StudentProfileContent({ student }: { student: TeachingStudent }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const router = useRouter();
  const sports = Array.from(
    new Map(student.classes.map((c) => [c.sportId, c.sportName])).entries(),
  );
  const [sport, setSport] = useState(
    sports.length === 1 ? String(sports[0][0]) : "",
  );
  const [classId, setClassId] = useState("");
  const [tab, setTab] = useState("profile");
  const editing = useRef({ dirty: false, busy: false });
  const classes = student.classes.filter((c) => String(c.sportId) === sport);
  const selected =
    classes.find((c) => String(c.classId) === classId) ??
    (classes.length === 1 ? classes[0] : undefined);
  function canLeave() {
    if (editing.current.busy) return false;
    if (
      editing.current.dirty &&
      !window.confirm(
        vi ? "Bỏ kế hoạch chưa lưu?" : "Discard your unsaved plan?",
      )
    )
      return false;
    editing.current = { dirty: false, busy: false };
    return true;
  }
  return (
    <div className={styles.workspace}>
      <button
        type="button"
        className={`btn btn--quiet ${styles.back}`}
        onClick={() => {
          if (canLeave()) router.push("/coach/members");
        }}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        {vi ? "Danh sách học viên" : "Students"}
      </button>
      <header className={styles.identity}>
        <UserAvatar
          userId={student.memberId}
          name={student.memberName}
          size={64}
        />
        <div>
          <h2>{student.memberName}</h2>
          <p>{student.email}</p>
          <small>
            {vi
              ? "Hồ sơ sức khỏe, kế hoạch và đánh giá theo lớp"
              : "Health profile, class plans and assessments"}
          </small>
        </div>
      </header>
      <div
        className={styles.bookmarks}
        role="group"
        aria-label={vi ? "Nội dung hồ sơ" : "Profile sections"}
      >
        {[
          {
            id: "profile",
            label: vi ? "Hồ sơ sức khỏe" : "Health profile",
            icon: HeartPulse,
          },
          {
            id: "current",
            label: vi ? "Kế hoạch học" : "Plans",
            icon: BookOpen,
          },
          {
            id: "history",
            label: vi ? "Đánh giá" : "Assessments",
            icon: History,
          },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => {
              if (tab !== id && canLeave()) setTab(id);
            }}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {tab === "profile" ? (
        <StudentPhysicalProfile memberId={student.memberId} />
      ) : (
        <>
          <TableFilters>
            <div className={styles.filters}>
              <label>
                {vi ? "Bộ môn" : "Sport"}
                <select
                  value={sport}
                  onChange={(e) => {
                    if (!canLeave()) return;
                    setSport(e.target.value);
                    setClassId("");
                  }}
                >
                  <option value="">
                    {vi ? "Chọn bộ môn" : "Choose sport"}
                  </option>
                  {sports.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {vi ? "Lớp hiện tại" : "Current class"}
                <select
                  disabled={!sport}
                  value={selected ? String(selected.classId) : ""}
                  onChange={(e) => {
                    if (canLeave()) setClassId(e.target.value);
                  }}
                >
                  <option value="">
                    {vi ? "Chọn lớp học" : "Choose class"}
                  </option>
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.className}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </TableFilters>
          {selected ? (
            <>
              {tab === "current" ? (
                <CurrentStudentClass
                  key={selected.classId}
                  student={student}
                  classId={selected.classId}
                  onClose={() => {
                    if (canLeave()) router.push("/coach/members");
                  }}
                  onEditingStateChange={(value) => {
                    editing.current = value;
                  }}
                />
              ) : (
                <div className={styles.assessmentColumns}>
                  <CurrentStudentClass
                    key={`${selected.classId}-feedback`}
                    student={student}
                    classId={selected.classId}
                    view="feedback"
                    onClose={() => {
                      if (canLeave()) router.push("/coach/members");
                    }}
                    onEditingStateChange={(value) => {
                      editing.current = value;
                    }}
                  />
                  <StudentLearningHistory
                    compact
                    key={selected.classId}
                    memberId={student.memberId}
                    classId={selected.classId}
                    sportName={selected.sportName}
                  />
                </div>
              )}
            </>
          ) : (
            <div className={styles.empty}>
              <BookOpen size={32} aria-hidden="true" />
              <h3>
                {vi
                  ? "Chọn môn và lớp của học viên"
                  : "Choose the student’s sport and class"}
              </h3>
              <p>
                {vi
                  ? "Mỗi lớp có kế hoạch, kết quả và điểm danh riêng."
                  : "Each class has its own plans, assessments and attendance."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CurrentStudentClass({
  student,
  classId,
  view = "plans",
  onClose,
  onEditingStateChange,
}: {
  student: TeachingStudent;
  classId: number;
  view?: "plans" | "feedback";
  onClose: () => void;
  onEditingStateChange: (value: { dirty: boolean; busy: boolean }) => void;
}) {
  const { language } = useLanguage();
  const revoked = useCoachAccess(
    (signal) => teachingApi.members(classId, signal, student.memberId),
    `${classId}:${student.memberId}`,
  );
  const state = useApi(
    async (signal) => {
      const [courses, members, records, sessions] = await Promise.all([
        ptApi.classes(signal),
        teachingApi.members(classId, signal, student.memberId),
        view === "feedback"
          ? teachingApi.records(classId, signal, false, student.memberId)
          : Promise.resolve([]),
        view === "feedback"
          ? ptApi.classSessions(classId, signal)
          : Promise.resolve([]),
      ]);
      return {
        course: courses.find((c) => c.classId === classId),
        member: members[0],
        records,
        sessions,
      };
    },
    [classId, student.memberId, view],
  );
  if (revoked)
    return (
      <p role="status">
        Access is no longer available.{" "}
        <Link href="/coach/members">Back to students</Link>
      </p>
    );
  return (
    <AsyncSection state={state}>
      {({ course, member, records, sessions }) =>
        course && member ? (
          view === "feedback" ? (
            <StudentCurrentAssessments
              className={course.name}
              records={records.filter(
                (record) => record.memberId === student.memberId,
              )}
              sessions={sessions}
            />
          ) : (
            <TeachingDetail
              fullPage
              initialTab={view}
              hideNavigation
              selection={{ course, member }}
              onClose={onClose}
              onEditingStateChange={onEditingStateChange}
            />
          )
        ) : (
          <p role="status">
            {language === "vi"
              ? "Phân công của học viên đã thay đổi. Hãy tải lại danh sách."
              : "This student’s assignment has changed. Refresh your directory."}
          </p>
        )
      }
    </AsyncSection>
  );
}
