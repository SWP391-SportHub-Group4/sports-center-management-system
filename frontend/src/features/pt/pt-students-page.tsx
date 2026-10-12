"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, HeartPulse, Search } from "lucide-react";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Pager } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { ptApi } from "./api";
import { PtMemberHealth } from "./pt-member-health";
import { PtStudentPreparation, PtStudentHistory } from "./pt-student-panel";
import styles from "./coach-students.module.css";

export function PtStudentDirectory() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState("all");
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) => ptApi.students(page, search, health, signal),
    [page, search, health],
  );
  // Preserve links from the PT calendar that previously opened an embedded profile.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get("memberId");
    if (
      id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      router.replace(
        `/coach/members/${id}?tab=${query.get("tab") === "plan" ? "plan" : "health"}`,
      );
    }
  }, [router]);
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <h2>{vi ? "Học viên PT của bạn" : "Your PT students"}</h2>
          <p>
            {vi
              ? "Tra cứu học viên đang phụ trách và mở hồ sơ đầy đủ để chuẩn bị buổi tập."
              : "Find your assigned students and open their full profile to prepare their training."}
          </p>
        </div>
        <HeartPulse size={32} aria-hidden="true" />
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
          {vi ? "Hồ sơ sức khỏe" : "Health profile"}
          <select
            value={health}
            onChange={(e) => {
              setHealth(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">
              {vi ? "Tất cả học viên" : "All students"}
            </option>
            <option value="notes">
              {vi ? "Có lưu ý sức khỏe" : "Health precautions"}
            </option>
            <option value="missing">
              {vi ? "Chưa có hồ sơ" : "Profile missing"}
            </option>
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
                  href={`/coach/members/${student.memberId}`}
                  className={styles.student}
                  key={student.memberId}
                >
                  <UserAvatar
                    userId={student.memberId}
                    name={student.memberName}
                    size={44}
                  />
                  <span className={styles.studentInfo}>
                    <strong>{student.memberName}</strong>
                    <small>{student.memberEmail}</small>
                    <span>
                      {student.goal ||
                        (vi ? "Chưa có mục tiêu" : "No training goal yet")}
                    </span>
                    {student.hasHealthNotes && (
                      <small>
                        {vi
                          ? "Có lưu ý sức khỏe"
                          : "Health precautions reported"}
                      </small>
                    )}
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
            {!data.items.length && (
              <div className={styles.empty}>
                <h3>
                  {vi ? "Không có học viên phù hợp" : "No matching students"}
                </h3>
                <p>
                  {vi
                    ? "Chỉ hiển thị học viên có phân công PT đang hoạt động."
                    : "Only students with an active PT assignment appear here."}
                </p>
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

export function PtStudentProfilePage({ memberId }: { memberId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const router = useRouter();
  const [tab, setTab] = useState("health");
  const editing = useRef(false);
  const state = useApi(
    (signal) => ptApi.relationships(1, signal, true, memberId),
    [memberId],
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "plan") {
      const timer = window.setTimeout(() => setTab("plan"), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);
  function canLeave() {
    if (
      editing.current &&
      !window.confirm(
        vi ? "Bỏ kế hoạch chưa lưu?" : "Discard your unsaved plan?",
      )
    )
      return false;
    editing.current = false;
    return true;
  }
  return (
    <AsyncSection
      state={state}
      isEmpty={(rows) => !rows.length}
      emptyMessage={
        vi
          ? "Bạn không còn được phân công cho học viên này."
          : "You are no longer assigned to this student."
      }
    >
      {(rows) => (
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
            <UserAvatar userId={memberId} name={rows[0].memberName} size={64} />
            <div>
              <h2>{rows[0].memberName}</h2>
              <p>
                {vi ? "Gym · Huấn luyện cá nhân" : "Gym · Personal training"}
              </p>
            </div>
          </header>
          <Tabs
            value={tab}
            onChange={(next) => {
              if (next !== tab && canLeave()) setTab(next);
            }}
            ariaLabel={vi ? "Hồ sơ học viên PT" : "PT student profile"}
            tabs={[
              { id: "health", label: vi ? "Sức khỏe" : "Health" },
              {
                id: "plan",
                label: vi ? "Kế hoạch cá nhân" : "Individual plans",
              },
              {
                id: "history",
                label: vi ? "Lịch sử buổi PT" : "PT session history",
              },
            ]}
          >
            {tab === "health" && <PtMemberHealth memberId={memberId} />}
            {tab === "plan" && (
              <div
                onChangeCapture={(event) => {
                  if ((event.target as HTMLElement).closest("form"))
                    editing.current = true;
                }}
              >
                <PtStudentPreparation
                  memberId={memberId}
                  includeProfile={false}
                  manageArchive
                  onSaved={() => {
                    editing.current = false;
                  }}
                  onDiscard={() => {
                    editing.current = false;
                  }}
                />
              </div>
            )}
            {tab === "history" && <PtStudentHistory memberId={memberId} />}
          </Tabs>
        </div>
      )}
    </AsyncSection>
  );
}
