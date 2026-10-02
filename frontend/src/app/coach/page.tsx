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
import { vietnamLocal } from "@/lib/vietnam-time";
import { courtScheduleApi } from "@/features/court-schedule/api";
import { catalogApi } from "@/features/catalog";
import type { CoachMemberRelationshipDto } from "@/lib/types";
import styles from "./coach.module.css";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const today = todayIso();

  const [sessionFilter, setSessionFilter] = useState<
    "ALL" | "CLASS_SESSION" | "PT_SESSION"
  >("ALL");
  const [memberFilter, setMemberFilter] = useState<"ALL" | "PT" | "CLASS">(
    "ALL",
  );

  const week = useApi(
    async (signal) => {
      if (!user) return null;
      const [sports, rooms] = await Promise.all([
        catalogApi.sports(signal),
        catalogApi.rooms(signal),
      ]);
      const specialties = sports.filter((sport) =>
        user.sportIds.includes(sport.sportId),
      );
      const entries = await courtScheduleApi.list(
        today,
        addDaysIso(today, 6),
        "",
        true,
        signal,
        specialties.some((sport) => sport.operationType === "ONE_ON_ONE"),
      );
      return { entries, rooms, specialties };
    },
    [today, user?.userId],
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
    () =>
      week.data?.entries.filter(
        (s) => vietnamLocal(s.startAtUtc).slice(0, 10) === today,
      ) ?? [],
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
    return week.data.entries.filter(
      (s) => sessionFilter === "ALL" || s.sourceType === sessionFilter,
    );
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

  const hasPt = week.data?.specialties.some(
    (sport) => sport.operationType === "ONE_ON_ONE",
  );

  return (
    <AppShell
      title={
        language === "en"
          ? `Welcome back, Coach ${user?.fullName ?? ""}`
          : `Xin chào, HLV ${user?.fullName ?? ""}`
      }
      description={
        language === "en"
          ? "Your assigned group classes and personal training sessions"
          : "Không gian làm việc hợp nhất dành cho Huấn luyện viên thể thao"
      }
      allow={["Coach"]}
      operationalLayout
    >
      {/* Multi-discipline Hero Banner */}
      <section
        className={styles.coachHero}
        aria-label={
          language === "en" ? "Coach Profile Summary" : "Hồ sơ huấn luyện viên"
        }
      >
        <div className={styles.coachHeroContent}>
          <div className={styles.coachRoleTag}>
            <IconUser size={13} />
            <span>
              {language === "en" ? "Center Coach" : "Huấn luyện viên trung tâm"}
            </span>
          </div>
          <h2 className={styles.coachHeroTitle}>
            {language === "en"
              ? "Teaching & Performance Operations"
              : "Trung tâm điều hành giảng dạy & Huấn luyện"}
          </h2>
          <p className={styles.coachHeroDesc}>
            {language === "en"
              ? "Review your assigned teaching schedule and the members under your supervision."
              : "Xem lịch giảng dạy được phân công và các hội viên bạn đang phụ trách."}
          </p>
        </div>
        <div className={styles.coachSpecialties}>
          {week.data?.specialties.map((sport) => (
            <div className={styles.specialtyPill} key={sport.sportId}>
              {sport.operationType === "ONE_ON_ONE" ? (
                <IconDumbbell size={16} />
              ) : (
                <IconCalendar size={16} />
              )}
              <span>{sport.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* KPI Stats */}
      <div className="grid grid--stats">
        <Stat
          label={language === "en" ? "Sessions Today" : "Ca dạy hôm nay"}
          value={week.loading || week.error ? "—" : todaySessions.length}
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
          value={
            week.loading || week.error ? "—" : (week.data?.entries.length ?? 0)
          }
          hint={
            language === "en"
              ? "Total scheduled teaching sessions"
              : "Tổng các ca giảng dạy đã xếp lịch"
          }
        />
        <Stat
          label={
            language === "en"
              ? "Dedicated 1:1 PT Clients"
              : "Học viên PT 1:1 phụ trách"
          }
          value={ptClients.length}
          hint={
            language === "en"
              ? "Active 1:1 training contracts (BR-23)"
              : "Hợp đồng huấn luyện cá nhân (BR-23)"
          }
        />
        <Stat
          label={
            language === "en" ? "Group Class Trainees" : "Hội viên lớp nhóm"
          }
          value={classTrainees.length}
          hint={
            language === "en"
              ? "Enrolled in your assigned group classes"
              : "Đăng ký các lớp nhóm bạn được phân công"
          }
        />
      </div>

      {/* Quick Action Bar */}
      <div className={styles.actionBar}>
        <Link
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          href="/coach/attendance"
        >
          <IconCheck size={18} />
          <span>
            {language === "en"
              ? "Attendance & Results"
              : "Điểm danh & Ghi kết quả"}
          </span>
        </Link>
        <Link
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          href="/coach/training-plans"
        >
          <IconClipboard size={18} />
          <span>
            {language === "en"
              ? "Personal Training Plans"
              : "Kế hoạch tập luyện PT"}
          </span>
        </Link>
        <Link
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          href="/coach/ai-suggestions"
        >
          <IconSparkles size={18} />
          <span>
            {language === "en" ? "AI Routine Assistant" : "Trợ lý AI giáo án"}
          </span>
        </Link>
        <Link
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          href="/coach/schedule"
        >
          <IconCalendar size={18} />
          <span>
            {language === "en" ? "Weekly Timetable" : "Thời khóa biểu chi tiết"}
          </span>
        </Link>
        <Link
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          href="/coach/members"
        >
          <IconUser size={18} />
          <span>
            {language === "en" ? "Trainee Profiles" : "Hồ sơ học viên"}
          </span>
        </Link>
      </div>

      {/* Teaching Schedule Card with Filter */}
      <Card
        title={
          language === "en"
            ? "Upcoming Classes & Training Sessions"
            : "Lịch giảng dạy & Ca tập sắp tới"
        }
        hint={
          language === "en"
            ? "Your assigned group classes and personal training sessions in the next 7 days. Times are shown in Vietnam time (UTC+7)."
            : "Các buổi lớp nhóm và PT của bạn trong 7 ngày tới. Thời gian hiển thị theo giờ Việt Nam (UTC+7)."
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
              {language === "en" ? "All" : "Tất cả"} (
              {week.data?.entries.length ?? 0})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${sessionFilter === "CLASS_SESSION" ? styles.filterBtnActive : ""}`}
              onClick={() => setSessionFilter("CLASS_SESSION")}
            >
              <IconCalendar size={14} />{" "}
              {language === "en" ? "Group classes" : "Lớp nhóm"}
            </button>
            {hasPt && (
              <button
                type="button"
                className={`${styles.filterBtn} ${sessionFilter === "PT_SESSION" ? styles.filterBtnActive : ""}`}
                onClick={() => setSessionFilter("PT_SESSION")}
              >
                <IconDumbbell size={14} />{" "}
                {language === "en"
                  ? "Personal Training"
                  : "Personal Training 1:1"}
              </button>
            )}
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
                {
                  text: language === "en" ? "Participants" : "Hội viên",
                  numeric: true,
                },
                language === "en" ? "Status" : "Trạng thái",
                language === "en" ? "Actions" : "Thao tác",
              ]}
            >
              {filteredSessions.map((session) => (
                <tr key={`${session.sourceType}-${session.sourceId}`}>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <strong>{session.title}</strong>
                      <span className="small muted">
                        {session.sourceType === "PT_SESSION"
                          ? "PT 1:1"
                          : language === "en"
                            ? "Group class"
                            : "Lớp nhóm"}
                      </span>
                    </div>
                  </td>
                  <td className="nowrap">
                    <div className={styles.timeCell}>
                      <span className={styles.timeMain}>
                        {formatDateTime(session.startAtUtc)}
                      </span>
                      <span className={styles.timeSub}>
                        {language === "en" ? "Until" : "Đến"}{" "}
                        {formatTime(session.endAtUtc)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.roomCell}>
                      <IconLocation size={14} />
                      {week.data?.rooms.find(
                        (room) => room.roomId === session.roomId,
                      )?.name ?? "—"}
                    </span>
                  </td>
                  <td className="num">
                    <strong>{session.participants.length}</strong>
                  </td>
                  <td>
                    <StatusChip value={session.status} />
                  </td>
                  <td className="nowrap">
                    <Link
                      className="btn btn--sm btn--primary"
                      href="/coach/schedule"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "4px 10px",
                        fontSize: "0.78rem",
                      }}
                    >
                      <IconCalendar size={13} />{" "}
                      {language === "en" ? "View schedule" : "Xem lịch"}
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
        title={
          language === "en"
            ? "Assigned Trainees & Active Clients"
            : "Danh sách học viên đang phụ trách"
        }
        hint={
          language === "en"
            ? "1:1 Personal Training clients and group session attendees under your supervision (BR-23)"
            : "Học viên kèm riêng 1:1 (PT) và học viên lớp nhóm do bạn phụ trách"
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
              {language === "en" ? "All" : "Tất cả"} (
              {members.data?.length ?? 0})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${memberFilter === "PT" ? styles.filterBtnActive : ""}`}
              onClick={() => setMemberFilter("PT")}
            >
              <IconDumbbell size={14} />{" "}
              {language === "en" ? "1:1 PT Clients" : "Học viên PT 1:1"} (
              {ptClients.length})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${memberFilter === "CLASS" ? styles.filterBtnActive : ""}`}
              onClick={() => setMemberFilter("CLASS")}
            >
              <IconYoga size={14} />{" "}
              {language === "en" ? "Group Class Trainees" : "Học viên Lớp nhóm"}{" "}
              ({classTrainees.length})
            </button>
          </div>
        </div>

        <AsyncSection
          state={members}
          emptyMessage={
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
              <StickerRegistrationsEmpty
                size={64}
                style={{ marginBottom: 10 }}
              />
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
                        <span
                          className={`${styles.disciplineBadge} ${styles["disciplineBadge--pt"]}`}
                        >
                          <IconDumbbell size={13} />{" "}
                          {language === "en" ? "1:1 PT" : "PT kèm 1:1"}
                        </span>
                      ) : (
                        <span
                          className={`${styles.disciplineBadge} ${styles["disciplineBadge--yoga"]}`}
                        >
                          <IconYoga size={13} />{" "}
                          {language === "en" ? "Group Class" : "Lớp nhóm"}
                        </span>
                      )}
                    </td>
                    <td>
                      {item.className ??
                        (isPt
                          ? language === "en"
                            ? "Personal Training 1:1"
                            : "Huấn luyện cá nhân 1:1"
                          : "—")}
                    </td>
                    <td className="nowrap small">
                      {formatDateTime(item.startedAt)}
                    </td>
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
                            {language === "en"
                              ? "Build Routine"
                              : "Soạn giáo án"}
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
