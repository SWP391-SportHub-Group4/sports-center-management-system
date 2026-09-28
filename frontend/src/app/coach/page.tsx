"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Stat, StatusChip, Table } from "@/components/ui";
import {
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconDumbbell,
  IconFlame,
  IconLocation,
  IconSparkles,
  IconUser,
  IconYoga,
  StickerCalendarEmpty,
  StickerRegistrationsEmpty,
} from "@/components/icons";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type { ClassSessionDto, CoachMemberRelationshipDto } from "@/lib/types";
import styles from "./coach.module.css";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const today = todayIso();

  const [sessionFilter, setSessionFilter] = useState<"ALL" | "YOGA" | "PT" | "GROUPX">("ALL");
  const [memberFilter, setMemberFilter] = useState<"ALL" | "PT" | "CLASS">("ALL");

  const week = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions/mine", {
        signal,
        query: { fromDate: today, toDate: addDaysIso(today, 6) },
      }),
    [today],
  );

  const members = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { activeOnly: true },
      }),
    [],
  );

  const todaySessions = useMemo(
    () => week.data?.filter((s) => s.startAtUtc.slice(0, 10) === today) ?? [],
    [week.data, today],
  );

  const ptClients = useMemo(
    () => members.data?.filter((m) => m.sourceType === "Personal") ?? [],
    [members.data],
  );

  const classTrainees = useMemo(
    () => members.data?.filter((m) => m.sourceType === "ClassBased") ?? [],
    [members.data],
  );

  const filteredSessions = useMemo(() => {
    if (!week.data) return [];
    if (sessionFilter === "YOGA") {
      return week.data.filter((s) => s.discipline?.toLowerCase().includes("yoga"));
    }
    if (sessionFilter === "PT") {
      return week.data.filter(
        (s) =>
          s.discipline?.toLowerCase().includes("personal") ||
          s.discipline?.toLowerCase().includes("pt"),
      );
    }
    if (sessionFilter === "GROUPX") {
      return week.data.filter((s) => s.discipline?.toLowerCase().includes("group"));
    }
    return week.data;
  }, [week.data, sessionFilter]);

  const filteredMembers = useMemo(() => {
    if (!members.data) return [];
    if (memberFilter === "PT") {
      return members.data.filter((m) => m.sourceType === "Personal");
    }
    if (memberFilter === "CLASS") {
      return members.data.filter((m) => m.sourceType === "ClassBased");
    }
    return members.data;
  }, [members.data, memberFilter]);

  const renderDisciplineBadge = (discipline?: string) => {
    const d = discipline?.toLowerCase() ?? "";
    if (d.includes("yoga")) {
      return (
        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--yoga"]}`}>
          <IconYoga size={14} /> Yoga
        </span>
      );
    }
    if (d.includes("personal") || d.includes("pt")) {
      return (
        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--pt"]}`}>
          <IconDumbbell size={14} /> PT 1:1
        </span>
      );
    }
    if (d.includes("group")) {
      return (
        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--groupx"]}`}>
          <IconFlame size={14} /> Group X
        </span>
      );
    }
    return <span className="small muted">{discipline || "—"}</span>;
  };

  return (
    <AppShell
      title={
        language === "en"
          ? `Welcome back, Coach ${user?.fullName ?? ""}`
          : `Xin chào, HLV ${user?.fullName ?? ""}`
      }
      description={
        language === "en"
          ? "Unified multidisciplinary workspace for Personal Training, Yoga, and Group Fitness"
          : "Không gian làm việc hợp nhất dành cho Huấn luyện viên thể thao"
      }
      allow={["Coach"]}
    >
      {/* Multi-discipline Hero Banner */}
      <section
        className={styles.coachHero}
        aria-label={language === "en" ? "Coach Profile Summary" : "Hồ sơ huấn luyện viên"}
      >
        <div className={styles.coachHeroContent}>
          <div className={styles.coachRoleTag}>
            <IconUser size={13} />
            <span>
              {language === "en"
                ? "Multidisciplinary Coach · Yoga & PT Specialist"
                : "Huấn luyện viên đa bộ môn · Yoga & PT Specialist"}
            </span>
          </div>
          <h2 className={styles.coachHeroTitle}>
            {language === "en"
              ? "Teaching & Performance Operations"
              : "Trung tâm điều hành giảng dạy & Huấn luyện"}
          </h2>
          <p className={styles.coachHeroDesc}>
            {language === "en"
              ? "Simultaneously orchestrate group studio sessions (Yoga, Group X) and one-on-one personal training regimens."
              : "Quản lý đồng thời các lớp Studio (Yoga, Group X) và các học viên kèm riêng 1:1 (Personal Training)."}
          </p>
        </div>
        <div className={styles.coachSpecialties}>
          <div className={`${styles.specialtyPill} ${styles["specialtyPill--yoga"]}`}>
            <IconYoga size={16} />
            <span>{language === "en" ? "Yoga & Recovery" : "Yoga & Thư giãn"}</span>
          </div>
          <div className={`${styles.specialtyPill} ${styles["specialtyPill--pt"]}`}>
            <IconDumbbell size={16} />
            <span>{language === "en" ? "Personal Training 1:1" : "Personal Training 1:1"}</span>
          </div>
          <div className={`${styles.specialtyPill} ${styles["specialtyPill--groupx"]}`}>
            <IconFlame size={16} />
            <span>{language === "en" ? "Group X Conditioning" : "Group X Thể lực"}</span>
          </div>
        </div>
      </section>

      {/* KPI Stats */}
      <div className="grid grid--stats">
        <Stat
          label={language === "en" ? "Sessions Today" : "Ca dạy hôm nay"}
          value={todaySessions.length}
          hint={
            todaySessions.length > 0
              ? language === "en"
                ? "Scheduled group classes & 1:1 PT"
                : "Bao gồm ca lớp nhóm & lịch PT"
              : language === "en"
                ? "No sessions scheduled today"
                : "Hôm nay không có ca dạy"
          }
        />
        <Stat
          label={language === "en" ? "Next 7 Days" : "Lịch dạy 7 ngày tới"}
          value={week.data?.length ?? 0}
          hint={
            language === "en"
              ? "Total scheduled teaching sessions"
              : "Tổng các ca giảng dạy đã xếp lịch"
          }
        />
        <Stat
          label={language === "en" ? "Dedicated 1:1 PT Clients" : "Học viên PT 1:1 phụ trách"}
          value={ptClients.length}
          hint={
            language === "en"
              ? "Active 1:1 training contracts (BR-23)"
              : "Hợp đồng huấn luyện cá nhân (BR-23)"
          }
        />
        <Stat
          label={language === "en" ? "Group Class Trainees" : "Hội viên lớp nhóm"}
          value={classTrainees.length}
          hint={
            language === "en"
              ? "Enrolled in Yoga / Group X classes"
              : "Đăng ký qua lớp Yoga / Group X"
          }
        />
      </div>

      {/* Quick Action Bar */}
      <div className={styles.actionBar}>
        <Link className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} href="/coach/attendance">
          <IconCheck size={18} />
          <span>{language === "en" ? "Attendance & Results" : "Điểm danh & Ghi kết quả"}</span>
        </Link>
        <Link className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} href="/coach/training-plans">
          <IconClipboard size={18} />
          <span>{language === "en" ? "Personal Training Plans" : "Kế hoạch tập luyện PT"}</span>
        </Link>
        <Link className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} href="/coach/ai-suggestions">
          <IconSparkles size={18} />
          <span>{language === "en" ? "AI Routine Assistant" : "Trợ lý AI giáo án"}</span>
        </Link>
        <Link className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} href="/coach/schedule">
          <IconCalendar size={18} />
          <span>{language === "en" ? "Weekly Timetable" : "Thời khóa biểu chi tiết"}</span>
        </Link>
        <Link className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} href="/coach/members">
          <IconUser size={18} />
          <span>{language === "en" ? "Trainee Profiles" : "Hồ sơ học viên"}</span>
        </Link>
      </div>

      {/* Teaching Schedule Card with Filter */}
      <Card
        title={language === "en" ? "Upcoming Classes & Training Sessions" : "Lịch giảng dạy & Ca tập sắp tới"}
        hint={
          language === "en"
            ? "Assigned studio classes (Yoga/Group X) and 1:1 personal training sessions for the next 7 days (BR-22)"
            : "Hiển thị tất cả ca đứng lớp Yoga/GroupX và ca kèm 1:1 của bạn trong 7 ngày tới (BR-22)"
        }
        bodyless
      >
        <div style={{ padding: "16px 20px 0" }}>
          <div className={styles.filterBar}>
            <button
              type="button"
              className={`${styles.filterBtn} ${sessionFilter === "ALL" ? styles.filterBtnActive : ""}`}
              onClick={() => setSessionFilter("ALL")}
            >
              {language === "en" ? "All" : "Tất cả"} ({week.data?.length ?? 0})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${sessionFilter === "YOGA" ? styles.filterBtnActive : ""}`}
              onClick={() => setSessionFilter("YOGA")}
            >
              <IconYoga size={14} /> {language === "en" ? "Yoga Classes" : "Lớp Yoga"}
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${sessionFilter === "PT" ? styles.filterBtnActive : ""}`}
              onClick={() => setSessionFilter("PT")}
            >
              <IconDumbbell size={14} /> {language === "en" ? "Personal Training" : "Personal Training 1:1"}
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${sessionFilter === "GROUPX" ? styles.filterBtnActive : ""}`}
              onClick={() => setSessionFilter("GROUPX")}
            >
              <IconFlame size={14} /> Group X
            </button>
          </div>
        </div>

        <AsyncSection
          state={week}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerCalendarEmpty size={64} style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontWeight: 600, color: "var(--navy)" }}>
                {sessionFilter === "ALL"
                  ? language === "en"
                    ? "You have no teaching sessions assigned in the next 7 days."
                    : "Bạn chưa có ca giảng dạy nào được phân công trong 7 ngày tới."
                  : language === "en"
                    ? "No sessions match the selected discipline filter."
                    : "Không tìm thấy ca dạy nào phù hợp với bộ lọc đã chọn."}
              </p>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                {language === "en"
                  ? "Schedules will automatically appear here once scheduled by Center Management."
                  : "Lịch dạy sẽ hiển thị tự động khi Quản lý trung tâm phân công lớp hoặc ca PT."}
              </p>
            </div>
          }
          isEmpty={() => filteredSessions.length === 0}
        >
          {() => (
            <Table
              headers={[
                language === "en" ? "Discipline & Class" : "Bộ môn & Lớp học",
                language === "en" ? "Time" : "Thời gian",
                language === "en" ? "Studio Room" : "Phòng tập",
                { text: language === "en" ? "Confirmed / Max" : "Sĩ số / Giới hạn", numeric: true },
                language === "en" ? "Status" : "Trạng thái",
                language === "en" ? "Actions" : "Thao tác",
              ]}
            >
              {filteredSessions.map((session) => (
                <tr key={session.sessionId}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <strong>{session.className}</strong>
                      {renderDisciplineBadge(session.discipline)}
                    </div>
                  </td>
                  <td className="nowrap">
                    <div className={styles.timeCell}>
                      <span className={styles.timeMain}>{formatDateTime(session.startAtUtc)}</span>
                      <span className={styles.timeSub}>
                        {language === "en" ? "Until" : "Đến"} {formatTime(session.endAtUtc)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.roomCell}>
                      <IconLocation size={14} />
                      {session.roomName}
                    </span>
                  </td>
                  <td className="num">
                    <strong>{session.confirmedCount}</strong>/{session.capacity}
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                  </td>
                  <td className="nowrap">
                    <Link
                      className="btn btn--sm btn--primary"
                      href={`/coach/attendance?sessionId=${session.sessionId}&date=${session.startAtUtc.slice(0, 10)}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", fontSize: "0.78rem" }}
                    >
                      <IconCheck size={13} /> {language === "en" ? "Attendance" : "Điểm danh"}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>

      {/* Members & Clients Card with Filter */}
      <Card
        title={language === "en" ? "Assigned Trainees & Active Clients" : "Danh sách học viên đang phụ trách"}
        hint={
          language === "en"
            ? "1:1 Personal Training clients and group session attendees under your supervision (BR-23)"
            : "Học viên kèm riêng 1:1 (PT) và học viên lớp nhóm Yoga/Group X do bạn quản lý (BR-23)"
        }
        bodyless
      >
        <div style={{ padding: "16px 20px 0" }}>
          <div className={styles.filterBar}>
            <button
              type="button"
              className={`${styles.filterBtn} ${memberFilter === "ALL" ? styles.filterBtnActive : ""}`}
              onClick={() => setMemberFilter("ALL")}
            >
              {language === "en" ? "All" : "Tất cả"} ({members.data?.length ?? 0})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${memberFilter === "PT" ? styles.filterBtnActive : ""}`}
              onClick={() => setMemberFilter("PT")}
            >
              <IconDumbbell size={14} /> {language === "en" ? "1:1 PT Clients" : "Học viên PT 1:1"} ({ptClients.length})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${memberFilter === "CLASS" ? styles.filterBtnActive : ""}`}
              onClick={() => setMemberFilter("CLASS")}
            >
              <IconYoga size={14} /> {language === "en" ? "Group Class Trainees" : "Học viên Lớp nhóm"} ({classTrainees.length})
            </button>
          </div>
        </div>

        <AsyncSection
          state={members}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerRegistrationsEmpty size={64} style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontWeight: 600, color: "var(--navy)" }}>
                {memberFilter === "ALL"
                  ? language === "en"
                    ? "No trainees currently assigned under your coaching scope."
                    : "Chưa có học viên nào trong danh sách phụ trách của bạn."
                  : language === "en"
                    ? "No trainees found in the selected category."
                    : "Không tìm thấy học viên nào trong nhóm đã chọn."}
              </p>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                {language === "en"
                  ? "Coaching relationships are established when members enroll in your classes or sign 1:1 PT contracts (BR-23)."
                  : "Mối quan hệ huấn luyện phát sinh khi học viên đăng ký lớp của bạn hoặc hợp đồng PT 1:1 (BR-23)."}
              </p>
            </div>
          }
          isEmpty={() => filteredMembers.length === 0}
        >
          {() => (
            <Table
              headers={[
                language === "en" ? "Trainee" : "Hội viên",
                language === "en" ? "Modality" : "Phân loại hình thức",
                language === "en" ? "Class / Program" : "Lớp / Chương trình",
                language === "en" ? "Active Since" : "Bắt đầu từ",
                language === "en" ? "Actions" : "Thao tác",
              ]}
            >
              {filteredMembers.map((item) => {
                const isPt = item.sourceType === "Personal";
                return (
                  <tr key={item.relationshipId}>
                    <td>
                      <strong>{item.memberName || item.memberEmail}</strong>
                      <div className="small muted">{item.memberEmail}</div>
                    </td>
                    <td>
                      {isPt ? (
                        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--pt"]}`}>
                          <IconDumbbell size={13} /> {language === "en" ? "1:1 PT" : "PT kèm 1:1"}
                        </span>
                      ) : (
                        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--yoga"]}`}>
                          <IconYoga size={13} /> {language === "en" ? "Group Class" : "Lớp nhóm"}
                        </span>
                      )}
                    </td>
                    <td>{item.className ?? (isPt ? (language === "en" ? "Personal Training 1:1" : "Huấn luyện cá nhân 1:1") : "—")}</td>
                    <td className="nowrap small">{formatDateTime(item.startedAt)}</td>
                    <td className="nowrap">
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Link
                          className="btn btn--ghost btn--sm"
                          href={`/coach/members?memberId=${item.memberId}`}
                        >
                          {language === "en" ? "Profile" : "Hồ sơ"}
                        </Link>
                        {isPt && (
                          <Link
                            className="btn btn--secondary btn--sm"
                            href={`/coach/training-plans?memberId=${item.memberId}`}
                          >
                            {language === "en" ? "Build Routine" : "Soạn giáo án"}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
