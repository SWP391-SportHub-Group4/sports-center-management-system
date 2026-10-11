"use client";

import { usePathname } from "next/navigation";
import { ArrowRight, Search, HeartPulse, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Drawer, Tabs } from "@/components/primitives";
import { AsyncSection, Field, Pager } from "@/components/ui";
import { CourseSticker } from "@/features/courses";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { formatDate } from "@/lib/format";
import { ptApi, type AssignedPtStudent } from "./api";
import { PtMemberHealth } from "./pt-member-health";
import { PtStudentPreparation, PtStudentHistory } from "./pt-student-panel";
import styles from "./coach-workspace.module.css";
import ptStyles from "./pt-coach-workspace.module.css";

export function PtCoachWorkspaceHeader() {
  const path = usePathname();
  const { language } = useLanguage();
  const vi = language === "vi";
  const group = /training-plans|ai-suggestions/.test(path)
    ? "plans"
    : /members|progress/.test(path)
      ? "members"
      : "schedule";
  if (group === "members") return null;
  return (
    <>
      <header className={`${styles.intro} ${ptStyles.intro}`}>
        <div>
          <h2>
            {group === "schedule"
              ? vi
                ? "Sẵn sàng cho buổi PT"
                : "Ready for your next PT session"
              : vi
                ? "Lộ trình phù hợp từng học viên"
                : "A plan for each student"}
          </h2>
          <p>
            {vi
              ? "Chuẩn bị kế hoạch, theo dõi buổi tập và ghi nhận tiến bộ trong cùng một không gian."
              : "Prepare training plans, follow your sessions and record progress in one workspace."}
          </p>
        </div>
        <CourseSticker sport="Gym" compact />
      </header>
    </>
  );
}

export function PtCoachStudents() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const desktop = useMediaQuery("(min-width: 1100px)");
  const [search, setSearch] = useState("");
  const [params, setParams] = useState({ page: 1, search: "", health: "all" });
  const [selected, setSelected] = useState<AssignedPtStudent | null>(null);
  const [tab, setTab] = useState("health");
  const [revision, setRevision] = useState(0);
  const dirty = useRef(false);
  const [linkError, setLinkError] = useState("");
  const confirmLeave = () => {
    if (
      dirty.current &&
      !window.confirm(
        vi
          ? "Bỏ các thay đổi kế hoạch chưa lưu?"
          : "Discard unsaved plan changes?",
      )
    )
      return false;
    dirty.current = false;
    return true;
  };
  const closeProfile = () => {
    if (confirmLeave()) setSelected(null);
  };
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const memberId = query.get("memberId");
    if (!memberId) return;
    const controller = new AbortController();
    ptApi
      .relationships(1, controller.signal, true, memberId)
      .then((rows) => {
        if (controller.signal.aborted) return;
        const member = rows.find((row) => row.memberId === memberId);
        if (!member) {
          setLinkError(
            vi
              ? "Học viên không còn thuộc danh sách phụ trách."
              : "This student is no longer assigned to you.",
          );
          return;
        }
        setSelected({
          ...member,
          goal: null,
          level: null,
          hasTrainingProfile: false,
          hasHealthNotes: false,
        });
        setTab(query.get("tab") === "plan" ? "plan" : "health");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLinkError(
            vi
              ? "Không mở được hồ sơ. Hãy tra cứu học viên bên dưới."
              : "Unable to open this profile. Find the student below.",
          );
      });
    return () => controller.abort();
  }, [vi]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setParams((current) => ({
          ...current,
          page: 1,
          search: search.trim(),
        })),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  const state = useApi(
    (signal) =>
      ptApi.students(params.page, params.search, params.health, signal),
    [params.page, params.search, params.health],
  );
  const profile = selected && (
    <div
      className={ptStyles.memberDetail}
      onChangeCapture={(event) => {
        if ((event.target as HTMLElement).closest("form")) dirty.current = true;
      }}
    >
      <header className={ptStyles.memberIdentity}>
        <span className={styles.avatar} aria-hidden="true">
          {selected.memberName.slice(0, 1)}
        </span>
        <div>
          <h3>{selected.memberName}</h3>
          <p>{selected.memberEmail}</p>
          <small>
            {vi ? "Phụ trách từ " : "Assigned since "}
            {formatDate(selected.startedAt)}
          </small>
        </div>
        {desktop && (
          <button
            className="btn btn--ghost"
            aria-label={vi ? "Đóng hồ sơ" : "Close profile"}
            onClick={closeProfile}
          >
            <X size={18} />
          </button>
        )}
      </header>
      <Tabs
        value={tab}
        onChange={(next) => {
          if (next !== tab && confirmLeave()) setTab(next);
        }}
        ariaLabel={vi ? "Hồ sơ học viên" : "Student profile"}
        tabs={[
          { id: "health", label: vi ? "Sức khỏe" : "Health" },
          { id: "plan", label: vi ? "Kế hoạch" : "Plan" },
          { id: "history", label: vi ? "Lịch sử" : "History" },
        ]}
      >
        {tab === "health" && (
          <PtMemberHealth
            key={`${selected.memberId}-${revision}`}
            memberId={selected.memberId}
          />
        )}
        {tab === "plan" && (
          <PtStudentPreparation
            key={`${selected.memberId}-${revision}`}
            memberId={selected.memberId}
            includeProfile={false}
            manageArchive
            onDiscard={() => {
              dirty.current = false;
            }}
            onSaved={() => {
              dirty.current = false;
            }}
          />
        )}
        {tab === "history" && (
          <PtStudentHistory
            key={`${selected.memberId}-${revision}`}
            memberId={selected.memberId}
          />
        )}
      </Tabs>
    </div>
  );
  return (
    <section className={styles.workspace}>
      {linkError && <p role="alert">{linkError}</p>}
      <div className={styles.sectionHeader}>
        <div>
          <h2>{vi ? "Tra cứu & hồ sơ" : "Directory & profiles"}</h2>
          <p className="muted">
            {vi
              ? "Tra cứu học viên, xem lưu ý sức khỏe và theo dõi quá trình tập luyện."
              : "Find students, review health precautions and follow their training."}
          </p>
        </div>
        <button
          className="btn btn--secondary"
          onClick={() => {
            if (!confirmLeave()) return;
            state.reload();
            setRevision((value) => value + 1);
          }}
        >
          {vi ? "Cập nhật" : "Refresh"}
        </button>
      </div>
      <div className={ptStyles.memberFilters}>
        <Field label={vi ? "Tra cứu học viên" : "Find a student"}>
          <div className={ptStyles.memberSearch}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={search}
              maxLength={150}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={vi ? "Nhập tên hoặc email" : "Enter name or email"}
            />
          </div>
        </Field>
        <Field label={vi ? "Hồ sơ sức khỏe" : "Health profile"}>
          <select
            value={params.health}
            onChange={(event) =>
              setParams((current) => ({
                ...current,
                page: 1,
                health: event.target.value,
              }))
            }
          >
            <option value="all">
              {vi ? "Tất cả học viên" : "All students"}
            </option>
            <option value="notes">
              {vi ? "Có lưu ý sức khỏe" : "Health precautions reported"}
            </option>
            <option value="missing">
              {vi ? "Chưa khai hồ sơ tập luyện" : "Training profile missing"}
            </option>
          </select>
        </Field>
      </div>
      <div className={ptStyles.membersLayout}>
        <div className={ptStyles.membersDirectory}>
          <AsyncSection state={state}>
            {(data) => (
              <>
                <p className={ptStyles.resultCount} role="status">
                  {data.totalCount} {vi ? "học viên" : "students"}
                </p>
                <div className={ptStyles.memberRows}>
                  {data.items.map((row) => (
                    <button
                      key={row.memberId}
                      className={ptStyles.memberRow}
                      aria-pressed={selected?.memberId === row.memberId}
                      onClick={() => {
                        if (!confirmLeave()) return;
                        setSelected(row);
                        setTab("health");
                      }}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {row.memberName.slice(0, 1)}
                      </span>
                      <span className={ptStyles.memberRowBody}>
                        <strong>{row.memberName}</strong>
                        <small>{row.memberEmail}</small>
                        <span>
                          {row.goal ||
                            (vi
                              ? "Chưa khai mục tiêu tập luyện"
                              : "Training goal not provided")}
                        </span>
                        {row.hasHealthNotes ? (
                          <small className={ptStyles.healthFlag}>
                            <HeartPulse size={14} aria-hidden="true" />
                            {vi ? "Có lưu ý sức khỏe" : "Health precautions"}
                          </small>
                        ) : (
                          !row.hasTrainingProfile && (
                            <small className={ptStyles.profileMissing}>
                              {vi
                                ? "Chưa có hồ sơ tập luyện"
                                : "Training profile missing"}
                            </small>
                          )
                        )}
                      </span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {!data.items.length && (
                  <div className={styles.empty}>
                    <CourseSticker sport="Gym" compact />
                    <p>
                      {vi
                        ? "Không có học viên phù hợp."
                        : "No matching students."}
                    </p>
                    {(params.search || params.health !== "all") && (
                      <button
                        className="btn btn--secondary"
                        onClick={() => {
                          setSearch("");
                          setParams({ page: 1, search: "", health: "all" });
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
                    onChange={(page) =>
                      setParams((current) => ({ ...current, page }))
                    }
                  />
                )}
              </>
            )}
          </AsyncSection>
        </div>
        {desktop && (
          <aside
            className={ptStyles.memberProfileFrame}
            aria-label={vi ? "Hồ sơ học viên" : "Student profile"}
          >
            {profile || (
              <div className={styles.empty}>
                <CourseSticker sport="Gym" compact />
                <h3>
                  {vi ? "Chọn học viên để xem hồ sơ" : "Select a student"}
                </h3>
                <p>
                  {vi
                    ? "Mục tiêu, lưu ý sức khỏe và các chỉ số đã đo sẽ hiển thị tại đây."
                    : "Training goals, health precautions and recorded measurements appear here."}
                </p>
              </div>
            )}
          </aside>
        )}
      </div>
      {selected && !desktop && (
        <Drawer
          title={vi ? "Hồ sơ học viên" : "Student profile"}
          size="lg"
          onClose={closeProfile}
        >
          {profile}
        </Drawer>
      )}
    </section>
  );
}
