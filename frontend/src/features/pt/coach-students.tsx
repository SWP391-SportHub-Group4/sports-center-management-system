"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
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
import { PreviousClassAssessments } from "./student-assessment-history";
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
      <header className={styles.heading}>
        <div>
          <h2>{vi ? "Học viên bạn đang phụ trách" : "Your students"}</h2>
          <p>
            {vi
              ? "Một hồ sơ cho mỗi học viên. Chọn môn và lớp trong hồ sơ để xem tiến độ và kế hoạch phù hợp."
              : "One profile per student. Choose their sport and class to review progress and plan their training."}
          </p>
        </div>
        <Users size={32} aria-hidden="true" />
      </header>
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
      <AsyncSection state={state}>
        {(data) => (
          <>
            <p className={styles.count} role="status">
              {data.totalCount} {vi ? "học viên" : "students"}
            </p>
            <div className={styles.directory}>
              {data.items.map((student) => (
                <Link
                  key={student.memberId}
                  href={`/coach/members/${student.memberId}`}
                  className={styles.student}
                >
                  <UserAvatar
                    userId={student.memberId}
                    name={student.memberName}
                    size={44}
                  />
                  <span className={styles.studentInfo}>
                    <strong>{student.memberName}</strong>
                    <small>{student.email}</small>
                    <span className={styles.sportTags}>
                      {Array.from(
                        new Set(student.classes.map((c) => c.sportName)),
                      ).map((name) => (
                        <span key={name}>{name}</span>
                      ))}
                    </span>
                    <small>
                      {student.classes.length}{" "}
                      {vi ? "lớp đang phụ trách" : "assigned classes"}
                    </small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
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
    </div>
  );
}

export function CoachStudentProfile({ memberId }: { memberId: string }) {
  const state = useApi(
    (signal) => teachingApi.student(memberId, signal),
    [memberId],
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
  const [tab, setTab] = useState("current");
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
              ? "Hồ sơ tiến độ theo môn và lớp"
              : "Progress profile by sport and class"}
          </small>
        </div>
      </header>
      <div className={styles.filters}>
        <label>
          {vi ? "Bộ môn" : "Sport"}
          <select
            value={sport}
            onChange={(e) => {
              if (!canLeave()) return;
              setSport(e.target.value);
              setClassId("");
              setTab("current");
            }}
          >
            <option value="">{vi ? "Chọn bộ môn" : "Choose sport"}</option>
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
            <option value="">{vi ? "Chọn lớp học" : "Choose class"}</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.className}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected ? (
        <>
          <div
            className={styles.bookmarks}
            role="group"
            aria-label={vi ? "Nội dung hồ sơ" : "Profile sections"}
          >
            <button
              type="button"
              aria-pressed={tab === "current"}
              onClick={() => {
                if (canLeave()) setTab("current");
              }}
            >
              <BookOpen size={18} aria-hidden="true" />
              {vi ? "Lớp hiện tại & kế hoạch" : "Current class & plans"}
            </button>
            <button
              type="button"
              aria-pressed={tab === "history"}
              onClick={() => {
                if (canLeave()) setTab("history");
              }}
            >
              <History size={18} aria-hidden="true" />
              {vi ? "Đánh giá từ lớp trước" : "Previous class assessments"}
            </button>
          </div>
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
            <PreviousClassAssessments
              key={selected.classId}
              memberId={student.memberId}
              classId={selected.classId}
              sportName={selected.sportName}
            />
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
    </div>
  );
}

function CurrentStudentClass({
  student,
  classId,
  onClose,
  onEditingStateChange,
}: {
  student: TeachingStudent;
  classId: number;
  onClose: () => void;
  onEditingStateChange: (value: { dirty: boolean; busy: boolean }) => void;
}) {
  const { language } = useLanguage();
  const state = useApi(
    async (signal) => {
      const [courses, members] = await Promise.all([
        ptApi.classes(signal),
        teachingApi.members(classId, signal, student.memberId),
      ]);
      return {
        course: courses.find((c) => c.classId === classId),
        member: members[0],
      };
    },
    [classId, student.memberId],
  );
  return (
    <AsyncSection state={state}>
      {({ course, member }) =>
        course && member ? (
          <TeachingDetail
            fullPage
            selection={{ course, member }}
            onClose={onClose}
            onEditingStateChange={onEditingStateChange}
          />
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
