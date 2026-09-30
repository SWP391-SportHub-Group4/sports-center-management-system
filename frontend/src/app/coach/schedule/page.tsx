"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import {
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconDumbbell,
  IconFlame,
  IconLocation,
  IconYoga,
  StickerCalendarEmpty,
} from "@/components/icons";
import { api } from "@/lib/apiClient";
import { addDaysIso, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { ClassSessionDto } from "@/lib/types";
import styles from "../coach.module.css";

const VIETNAMESE_DAYS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

const ENGLISH_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ENGLISH_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function CoachSchedulePage() {
  const { language } = useLanguage();
  const today = todayIso();
  const [viewMode, setViewMode] = useState<"GRID" | "TABLE">("GRID");
  const [weekOffset, setWeekOffset] = useState(0);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(addDaysIso(today, 13));
  const [disciplineFilter, setDisciplineFilter] = useState<"ALL" | "YOGA" | "PT" | "GROUPX">("ALL");

  // Determine target week's Monday (or start of week)
  const currentWeekDays = useMemo(() => {
    const todayDate = new Date();
    // In Vietnam, Monday is first day of work week
    const currentDay = todayDate.getDay(); // 0 is Sunday, 1 is Monday...
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() + distanceToMonday + weekOffset * 7);

    const days: { dateIso: string; dayName: string; formattedDate: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        dateIso: iso,
        dayName: language === "en" ? ENGLISH_DAYS[d.getDay()] : VIETNAMESE_DAYS[d.getDay()],
        formattedDate:
          language === "en"
            ? `${d.getDate()} ${ENGLISH_MONTHS[d.getMonth()]}`
            : `${d.getDate()} Thg ${d.getMonth() + 1}`,
        isToday: iso === today,
      });
    }
    return days;
  }, [today, weekOffset, language]);

  const activeFromDate = viewMode === "GRID" ? (currentWeekDays[0]?.dateIso || today) : fromDate;
  const activeToDate = viewMode === "GRID" ? (currentWeekDays[6]?.dateIso || addDaysIso(today, 6)) : toDate;

  const sessions = useApi(
    (signal) =>
      api.get<ClassSessionDto[]>("/api/class-sessions/mine", {
        signal,
        query: { fromDate: activeFromDate, toDate: activeToDate },
      }),
    [activeFromDate, activeToDate],
  );

  const filteredSessions = useMemo(() => {
    if (!sessions.data) return [];
    if (disciplineFilter === "YOGA") {
      return sessions.data.filter((s) => s.discipline?.toLowerCase().includes("yoga"));
    }
    if (disciplineFilter === "PT") {
      return sessions.data.filter(
        (s) =>
          s.discipline?.toLowerCase().includes("personal") ||
          s.discipline?.toLowerCase().includes("pt"),
      );
    }
    if (disciplineFilter === "GROUPX") {
      return sessions.data.filter((s) => s.discipline?.toLowerCase().includes("group"));
    }
    return sessions.data;
  }, [sessions.data, disciplineFilter]);

  const renderDisciplineBadge = (discipline?: string) => {
    const d = discipline?.toLowerCase() ?? "";
    if (d.includes("yoga")) {
      return (
        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--yoga"]}`}>
          <IconYoga size={13} /> Yoga
        </span>
      );
    }
    if (d.includes("personal") || d.includes("pt")) {
      return (
        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--pt"]}`}>
          <IconDumbbell size={13} /> PT 1:1
        </span>
      );
    }
    if (d.includes("group")) {
      return (
        <span className={`${styles.disciplineBadge} ${styles["disciplineBadge--groupx"]}`}>
          <IconFlame size={13} /> Group X
        </span>
      );
    }
    return <span className="small muted">{discipline || "—"}</span>;
  };

  return (
    <AppShell
      title={language === "en" ? "Teaching Schedule & Timetable" : "Thời khóa biểu & Lịch dạy"}
      description={
        language === "en"
          ? "Unified teaching schedule: Group Classes (Yoga, Group X) and 1:1 Personal Training sessions (BR-15, BR-22)"
          : "Lịch giảng dạy hợp nhất: Lớp nhóm (Yoga, Group X) và Ca kèm 1:1 (Personal Training) (BR-15, BR-22)"
      }
      allow={["Coach"]}
    >
      {/* Control bar: Filters & View Switcher */}
      <Card title={language === "en" ? "View Modes & Discipline Filters" : "Chế độ hiển thị & Bộ lọc"}>
        <div className={styles.viewToggleBar}>
          <div className={styles.viewToggleGroup}>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === "GRID" ? styles.viewToggleBtnActive : ""}`}
              onClick={() => setViewMode("GRID")}
            >
              <IconCalendar size={15} />
              <span>{language === "en" ? "Weekly Grid" : "Lưới tuần trực quan"}</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === "TABLE" ? styles.viewToggleBtnActive : ""}`}
              onClick={() => setViewMode("TABLE")}
            >
              <IconClipboard size={15} />
              <span>{language === "en" ? "Detailed Table" : "Bảng danh sách"}</span>
            </button>
          </div>

          {/* Discipline Filters */}
          <div className={styles.filterBar} style={{ margin: 0 }}>
            <button
              type="button"
              className={`${styles.filterBtn} ${disciplineFilter === "ALL" ? styles.filterBtnActive : ""}`}
              onClick={() => setDisciplineFilter("ALL")}
            >
              {language === "en" ? "All" : "Tất cả"} ({sessions.data?.length ?? 0})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${disciplineFilter === "YOGA" ? styles.filterBtnActive : ""}`}
              onClick={() => setDisciplineFilter("YOGA")}
            >
              <IconYoga size={14} /> Yoga
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${disciplineFilter === "PT" ? styles.filterBtnActive : ""}`}
              onClick={() => setDisciplineFilter("PT")}
            >
              <IconDumbbell size={14} /> {language === "en" ? "Personal Training" : "Personal Training 1:1"}
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${disciplineFilter === "GROUPX" ? styles.filterBtnActive : ""}`}
              onClick={() => setDisciplineFilter("GROUPX")}
            >
              <IconFlame size={14} /> Group X
            </button>
          </div>
        </div>

        {viewMode === "TABLE" && (
          <div style={{ padding: "14px 18px 0" }}>
            <div className="form form--inline" style={{ margin: 0 }}>
              <Field label={language === "en" ? "From Date" : "Từ ngày"}>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </Field>
              <Field label={language === "en" ? "To Date" : "Đến ngày"}>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </Card>

      {/* VIEW 1: WEEKLY TIME-GRID CALENDAR */}
      {viewMode === "GRID" && (
        <Card
          title={
            language === "en"
              ? weekOffset === 0
                ? "This Week's Timetable"
                : `Week Schedule (${currentWeekDays[0]?.formattedDate} – ${currentWeekDays[6]?.formattedDate})`
              : weekOffset === 0
                ? "Thời khóa biểu tuần này"
                : `Thời khóa biểu tuần (${currentWeekDays[0]?.formattedDate} – ${currentWeekDays[6]?.formattedDate})`
          }
          hint={
            language === "en"
              ? "7-day weekly grid for immediate visibility into available slots, morning/evening sessions, and instant attendance logging (BR-22)"
              : "Bố cục lưới 7 ngày giúp nắm bắt nhanh các khoảng trống, ca dạy sáng/chiều và trực tiếp điểm danh (BR-22)"
          }
          bodyless
        >
          <div
            style={{
              padding: "10px 18px",
              background: "rgba(248, 250, 252, 0.8)",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setWeekOffset((prev) => prev - 1)}
              >
                {language === "en" ? "← Prev Week" : "← Tuần trước"}
              </button>
              <button
                type="button"
                className={`btn btn--sm ${weekOffset === 0 ? "btn--primary" : "btn--secondary"}`}
                onClick={() => setWeekOffset(0)}
              >
                {language === "en" ? "Current Week" : "Tuần hiện tại"}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setWeekOffset((prev) => prev + 1)}
              >
                {language === "en" ? "Next Week →" : "Tuần tới →"}
              </button>
            </div>

            <div className="small muted">
              {language === "en" ? "Viewing week:" : "Đang xem tuần:"}{" "}
              <strong>{currentWeekDays[0]?.formattedDate}</strong> – <strong>{currentWeekDays[6]?.formattedDate}</strong>
            </div>
          </div>

          <AsyncSection
            state={sessions}
            emptyMessage={language === "en" ? "No session data available for this week." : "Không có dữ liệu ca dạy trong tuần này."}
            isEmpty={() => false}
          >
            {() => (
              <div className={styles.calendarScrollWrapper}>
                <div className={styles.calendarGrid}>
                  {currentWeekDays.map((day) => {
                    const daySessions = filteredSessions.filter(
                      (s) => s.startAtUtc.slice(0, 10) === day.dateIso,
                    );

                    return (
                      <div
                        key={day.dateIso}
                        className={`${styles.dayColumn} ${day.isToday ? styles.dayColumnToday : ""}`}
                      >
                        {/* Day Header */}
                        <div
                          className={`${styles.dayHeader} ${day.isToday ? styles.dayHeaderToday : ""}`}
                        >
                          <span className={styles.dayName}>{day.dayName}</span>
                          <span className={styles.dayDate}>{day.formattedDate}</span>
                          {day.isToday && (
                            <span className={styles.todayPill}>
                              {language === "en" ? "Today" : "Hôm nay"}
                            </span>
                          )}
                        </div>

                        {/* Day Sessions List */}
                        <div className={styles.dayBody}>
                          {daySessions.length === 0 ? (
                            <div className={styles.calendarEmptyDay}>
                              {language === "en" ? "No sessions" : "Không có ca dạy"}
                            </div>
                          ) : (
                            daySessions.map((session) => (
                              <div key={session.sessionId} className={styles.calendarCard}>
                                <div className={styles.calendarCardTime}>
                                  <span>{formatTime(session.startAtUtc)} – {formatTime(session.endAtUtc)}</span>
                                  {renderDisciplineBadge(session.discipline)}
                                </div>
                                <div className={styles.calendarCardTitle}>
                                  {session.className}
                                </div>
                                <div className={styles.calendarCardMeta}>
                                  <span className={styles.roomCell}>
                                    <IconLocation size={13} />
                                    {session.roomName}
                                  </span>
                                </div>
                                <div className={styles.calendarCardCapacity}>
                                  <span className="small muted">
                                    {language === "en" ? "Enrolled:" : "Sĩ số:"}
                                  </span>
                                  <strong>
                                    {session.confirmedCount}/{session.capacity}
                                  </strong>
                                </div>
                                <div className={styles.calendarCardAction}>
                                  <Link
                                    className="btn btn--sm btn--primary"
                                    href={`/coach/attendance?sessionId=${session.sessionId}&date=${day.dateIso}`}
                                    style={{
                                      width: "100%",
                                      display: "inline-flex",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      gap: "4px",
                                      padding: "4px 8px",
                                      fontSize: "0.76rem",
                                    }}
                                  >
                                    <IconCheck size={13} /> {language === "en" ? "Attendance" : "Điểm danh"}
                                  </Link>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </AsyncSection>
        </Card>
      )}

      {/* VIEW 2: DETAILED TABLE VIEW */}
      {viewMode === "TABLE" && (
        <Card
          title={language === "en" ? "Detailed Session Table" : "Bảng chi tiết các ca dạy"}
          hint={
            language === "en"
              ? "All sessions officially assigned to you. Capacity ceiling is enforced by room dimensions & class setup (BR-51)"
              : "Chỉ các ca bạn được phân công chính thức. Trần sĩ số được cố định theo sức chứa phòng & cấu hình lớp (BR-51)"
          }
          bodyless
        >
          <AsyncSection
            state={sessions}
            emptyMessage={
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <StickerCalendarEmpty size={64} style={{ marginBottom: 10 }} />
                <p style={{ margin: 0, fontWeight: 600, color: "var(--navy)" }}>
                  {language === "en"
                    ? "No teaching sessions found within the selected date range."
                    : "Không có ca dạy nào trong khoảng thời gian đã chọn."}
                </p>
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  {language === "en"
                    ? "Try adjusting the date range or selecting a different discipline filter."
                    : "Hãy thử chọn khoảng ngày khác hoặc điều chỉnh bộ lọc bộ môn."}
                </p>
              </div>
            }
            isEmpty={() => filteredSessions.length === 0}
          >
            {() => (
              <Table
                headers={[
                  language === "en" ? "Discipline & Class" : "Bộ môn & Lớp học",
                  language === "en" ? "Schedule & Time" : "Thời gian diễn ra",
                  language === "en" ? "Studio Room" : "Phòng tập",
                  { text: language === "en" ? "Enrolled" : "Đã đăng ký", numeric: true },
                  { text: language === "en" ? "Capacity" : "Sức chứa tối đa", numeric: true },
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
                      <strong>{session.confirmedCount}</strong>
                    </td>
                    <td className="num">
                      {session.capacity}
                      {session.capacity !== session.baselineCapacity && (
                        <div className="small muted">
                          {language === "en" ? `Baseline: ${session.baselineCapacity}` : `Gốc: ${session.baselineCapacity}`}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusChip value={session.status} />
                      {session.rescheduledFromSessionId && (
                        <div className="small muted">
                          {language === "en" ? "Rescheduled session" : "Buổi học thay thế"}
                        </div>
                      )}
                    </td>
                    <td className="nowrap">
                      <Link
                        className="btn btn--sm btn--primary"
                        href={`/coach/attendance?sessionId=${session.sessionId}&date=${session.startAtUtc.slice(0, 10)}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", fontSize: "0.78rem" }}
                      >
                        <IconCheck size={13} /> {language === "en" ? "Take Attendance" : "Điểm danh ca này"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </AsyncSection>
        </Card>
      )}
    </AppShell>
  );
}
