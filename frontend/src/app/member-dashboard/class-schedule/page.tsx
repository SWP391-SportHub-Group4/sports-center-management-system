"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { Feedback } from "@/components/ui";
import { api } from "@/lib/apiClient";
import {
  addDaysIso,
  formatDate,
  formatTime,
  todayIso,
} from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberPackageDto, MemberSessionDto } from "@/lib/types";
import styles from "./class-schedule.module.css";

export default function MemberSchedulePage() {
  const { language } = useLanguage();
  const [viewMode, setViewMode] = useState<"grid" | "cards">("grid");
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(addDaysIso(todayIso(), 13));
  const [discipline, setDiscipline] = useState("");
  const [packageId, setPackageId] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState<string | null>(null);

  const disciplines = useMemo(() => [
    { value: "", label: language === "en" ? "All Disciplines" : "Tất cả bộ môn" },
    { value: "Yoga", label: "🧘‍♀️ Yoga" },
    { value: "GroupX", label: "🔥 Group X" },
    { value: "PersonalTraining", label: "🏋️ Personal Training" },
  ], [language]);

  // Modal confirm state
  const [bookingSession, setBookingSession] = useState<MemberSessionDto["session"] | null>(null);
  const [lastBookedSession, setLastBookedSession] = useState<MemberSessionDto["session"] | null>(null);
  const [cancellingSession, setCancellingSession] = useState<{
    enrollmentId: string;
    className: string;
    startAtUtc: string;
  } | null>(null);

  // Keyboard Escape listener for modals
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBookingSession(null);
        setCancellingSession(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const action = useAction();

  // 7 days for the selected week in grid view
  const weekDays = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diffToMonday + weekOffset * 7);

    const days = [];
    const weekdayNamesVi = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const weekdayNamesEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const weekday = language === "en"
        ? weekdayNamesEn[d.getDay()]
        : (i === 6 ? "Chủ Nhật" : weekdayNamesVi[d.getDay()]);
      const isToday = iso === todayIso();
      const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      days.push({ iso, weekday, dayLabel, isToday });
    }
    return days;
  }, [weekOffset, language]);

  const queryFrom = viewMode === "grid" ? weekDays[0].iso : fromDate;
  const queryTo = viewMode === "grid" ? weekDays[6].iso : toDate;

  const sessions = useApi(
    (signal) =>
      api.get<MemberSessionDto[]>("/api/members/me/schedule", {
        signal,
        query: { fromDate: queryFrom, toDate: queryTo, discipline: discipline || undefined },
      }),
    [queryFrom, queryTo, discipline],
  );

  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );

  const usablePackages = useMemo(
    () => packages.data?.filter((item) => item.isUsable) ?? [],
    [packages.data],
  );

  // Generate 7-day pill dates starting from today for cards view
  const datePills = useMemo(() => {
    const list = [];
    const today = new Date();
    const weekdayNamesEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const weekday = language === "en"
        ? (i === 0 ? "Today" : i === 1 ? "Tomorrow" : weekdayNamesEn[d.getDay()])
        : (i === 0 ? "Hôm nay" : i === 1 ? "Ngày mai" : `Thứ ${d.getDay() === 0 ? "CN" : d.getDay() + 1}`);
      const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      list.push({ iso, weekday, dayLabel });
    }
    return list;
  }, [language]);

  // Filtered and grouped sessions for cards view
  const groupedSessions = useMemo(() => {
    if (!sessions.data) return {};

    let list = sessions.data;
    if (selectedDayFilter) {
      list = list.filter((item) => item.session.startAtUtc.startsWith(selectedDayFilter));
    }

    const groups: Record<string, MemberSessionDto[]> = {};
    for (const item of list) {
      const dayKey = item.session.startAtUtc.split("T")[0];
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(item);
    }

    return groups;
  }, [sessions.data, selectedDayFilter]);

  const sortedDayKeys = useMemo(
    () => Object.keys(groupedSessions).sort((a, b) => a.localeCompare(b)),
    [groupedSessions],
  );

  const handleEnroll = async () => {
    if (!bookingSession) return;
    const target = bookingSession;

    const done = await action.run(
      () =>
        api.post("/api/enrollments", {
          sessionId: target.sessionId,
          memberPackageId: packageId || undefined,
        }),
      language === "en"
        ? "Booking successful! 1 session has been deducted from your package."
        : "Đặt chỗ thành công! 1 buổi tập đã được trừ vào gói của bạn.",
    );

    if (done !== null) {
      setLastBookedSession(target);
      setBookingSession(null);
      await sessions.reload();
      await packages.reload();
    }
  };

  const handleCancelEnrollment = async () => {
    if (!cancellingSession) return;

    const done = await action.run(
      () => api.post(`/api/enrollments/${cancellingSession.enrollmentId}/cancel`, {}),
      language === "en"
        ? "Cancellation successful! Your session has been refunded back to your package."
        : "Hủy chỗ thành công! Buổi tập đã được hoàn lại vào gói tập của bạn.",
    );

    if (done !== null) {
      setCancellingSession(null);
      await sessions.reload();
      await packages.reload();
    }
  };

  const downloadIcs = (session: MemberSessionDto["session"]) => {
    const start = new Date(session.startAtUtc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = new Date(session.endAtUtc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//SportHub//Member Hub//${language.toUpperCase()}`,
      "BEGIN:VEVENT",
      `SUMMARY:${language === "en" ? "Class" : "Lớp"} ${session.className} (${session.discipline})`,
      `DESCRIPTION:${language === "en" ? "Coach" : "HLV"}: ${session.coachName} - ${language === "en" ? "Room" : "Phòng"}: ${session.roomName}`,
      `LOCATION:SportHub - ${session.roomName}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sporthub-${session.className.toLowerCase().replace(/\s+/g, "-")}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getTimeOfDayTag = (startAt: string) => {
    const hour = new Date(startAt).getHours();
    if (language === "en") {
      if (hour < 12) return "Morning";
      if (hour < 18) return "Afternoon";
      return "Evening";
    }
    if (hour < 12) return "Sáng";
    if (hour < 18) return "Chiều";
    return "Tối";
  };

  const formatDayTitle = (isoDate: string) => {
    const today = todayIso();
    const tomorrow = addDaysIso(today, 1);
    if (isoDate === today) {
      return language === "en" ? `Today (${formatDate(isoDate)})` : `Hôm nay (${formatDate(isoDate)})`;
    }
    if (isoDate === tomorrow) {
      return language === "en" ? `Tomorrow (${formatDate(isoDate)})` : `Ngày mai (${formatDate(isoDate)})`;
    }
    return formatDate(isoDate);
  };

  const getDisciplineClass = (disciplineStr: string) => {
    if (disciplineStr.toLowerCase().includes("yoga")) return styles.badgeYoga;
    if (disciplineStr.toLowerCase().includes("group")) return styles.badgeGroupX;
    return styles.badgePT;
  };

  const calculateDurationMinutes = (startAt: string, endAt: string) => {
    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();
    return Math.round((end - start) / 60000);
  };

  return (
    <MemberShell
      title={language === "en" ? "Class Schedule & Booking" : "Lịch lớp học"}
      description={
        language === "en"
          ? "Explore workout timetable and book spots for Yoga, GroupX, and Personal Training"
          : "Xem lịch và đặt chỗ các lớp Yoga, GroupX và Huấn luyện viên cá nhân"
      }
    >
      <div className={styles.container}>
        {/* Filter Panel */}
        <div className={styles.filterPanel}>
          <div className={styles.filterHeaderRow}>
            {/* Discipline tabs */}
            <div className={styles.disciplineTabs}>
              {disciplines.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.disciplineTab} ${discipline === item.value ? styles.disciplineTabActive : ""}`}
                  onClick={() => setDiscipline(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* View Mode Toggle Switcher */}
            <div className={styles.viewModeToggle}>
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === "grid" ? styles.viewModeBtnActive : ""}`}
                onClick={() => setViewMode("grid")}
                title={language === "en" ? "View weekly grid timetable" : "Xem dạng bảng lưới ô vuông theo tuần"}
              >
                <span>{language === "en" ? "⊞ Weekly Grid" : "⊞ Lưới tuần"}</span>
              </button>
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === "cards" ? styles.viewModeBtnActive : ""}`}
                onClick={() => setViewMode("cards")}
                title={language === "en" ? "View detailed list cards" : "Xem dạng thẻ danh sách chi tiết"}
              >
                <span>{language === "en" ? "☰ Cards View" : "☰ Thẻ danh sách"}</span>
              </button>
            </div>
          </div>

          {/* Quick Date Pills (in cards view) */}
          {viewMode === "cards" && (
            <div className={styles.dateStrip}>
              <button
                type="button"
                className={`${styles.datePill} ${selectedDayFilter === null ? styles.datePillActive : ""}`}
                onClick={() => setSelectedDayFilter(null)}
              >
                <span className={styles.datePillWeekday}>
                  {language === "en" ? "All" : "Toàn bộ"}
                </span>
                <span className={styles.datePillDay}>
                  {language === "en" ? "14 days" : "14 ngày"}
                </span>
              </button>

              {datePills.map((pill) => (
                <button
                  key={pill.iso}
                  type="button"
                  className={`${styles.datePill} ${selectedDayFilter === pill.iso ? styles.datePillActive : ""}`}
                  onClick={() =>
                    setSelectedDayFilter(selectedDayFilter === pill.iso ? null : pill.iso)
                  }
                >
                  <span className={styles.datePillWeekday}>{pill.weekday}</span>
                  <span className={styles.datePillDay}>{pill.dayLabel}</span>
                </button>
              ))}
            </div>
          )}

          {/* Secondary Filters: Package & Custom Date Inputs */}
          <div className={styles.secondaryFilters}>
            <div className={styles.packageSelectorGroup}>
              <span>{language === "en" ? "Applied Pass:" : "Gói áp dụng:"}</span>
              <select
                className={styles.packageSelect}
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
              >
                <option value="">
                  {language === "en" ? "Auto select (prioritize expiring soon)" : "Tự động chọn (ưu tiên gói sắp hết hạn)"}
                </option>
                {usablePackages.map((pkg) => (
                  <option key={pkg.memberPackageId} value={pkg.memberPackageId}>
                    {pkg.packageName} - {language === "en" ? `${pkg.remainingSessions ?? "Unlimited"} left` : `Còn ${pkg.remainingSessions ?? "Vô hạn"} buổi`}
                  </option>
                ))}
              </select>
            </div>

            {viewMode === "cards" && (
              <div className={styles.dateRangeInputs}>
                <span>{language === "en" ? "Custom dates:" : "Tùy chỉnh ngày:"}</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSelectedDayFilter(null);
                  }}
                />
                <span>→</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setSelectedDayFilter(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* Warning banner if member has no usable package */}
          {usablePackages.length === 0 && !packages.loading && (
            <div className={styles.packageWarning}>
              <span className={styles.packageWarningIcon}>⚠️</span>
              <div>
                <strong>
                  {language === "en" ? "No eligible packages available:" : "Chưa có gói tập khả dụng:"}
                </strong>{" "}
                {language === "en"
                  ? "You need at least one valid package with remaining sessions to book classes (BR-16). Please visit reception or review passes in "
                  : "Bạn cần sở hữu ít nhất một gói tập còn hiệu lực và còn lượt để đăng ký lớp (BR-16). Vui lòng liên hệ quầy Lễ tân hoặc xem danh mục tại mục "}
                <Link href="/member-dashboard/my-plans" style={{ fontWeight: 700, textDecoration: "underline" }}>
                  {language === "en" ? "Membership Passes" : "Gói hội viên"}
                </Link>.
              </div>
            </div>
          )}

          {/* Action Feedback alerts */}
          {(action.error || action.success) && (
            <Feedback error={action.error} success={action.success} />
          )}

          {/* Success Booking Banner with Calendar Download */}
          {lastBookedSession && (
            <div className={styles.successBanner}>
              <div>
                🎉 <strong>{language === "en" ? "Booking Successful:" : "Đặt chỗ thành công:"}</strong>{" "}
                {language === "en" ? "Class" : "Lớp"} {lastBookedSession.className} ({formatDate(lastBookedSession.startAtUtc)} {language === "en" ? "at" : "lúc"} {formatTime(lastBookedSession.startAtUtc)})
              </div>
              <button
                type="button"
                className={styles.calendarBtn}
                onClick={() => downloadIcs(lastBookedSession)}
              >
                {language === "en" ? "📅 Download Calendar Event (.ics)" : "📅 Thêm vào lịch (.ics)"}
              </button>
            </div>
          )}
        </div>

        {/* Week Navigation Toolbar (In grid view) */}
        {viewMode === "grid" && (
          <div className={styles.weekNavToolbar}>
            <div className={styles.weekNavLeft}>
              <button
                type="button"
                className={styles.weekNavBtn}
                onClick={() => setWeekOffset((prev) => prev - 1)}
              >
                {language === "en" ? "◀ Prev Week" : "◀ Tuần trước"}
              </button>
              <button
                type="button"
                className={styles.weekNavBtn}
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
              >
                {language === "en" ? "Current Week" : "Tuần hiện tại"}
              </button>
              <button
                type="button"
                className={styles.weekNavBtn}
                onClick={() => setWeekOffset((prev) => prev + 1)}
              >
                {language === "en" ? "Next Week ▶" : "Tuần sau ▶"}
              </button>
            </div>

            <div className={styles.weekTitle}>
              {language === "en"
                ? `Week Timetable: ${formatDate(weekDays[0].iso)} – ${formatDate(weekDays[6].iso)}`
                : `Lịch tuần: ${formatDate(weekDays[0].iso)} – ${formatDate(weekDays[6].iso)}`}
            </div>
          </div>
        )}

        {/* Schedule Content */}
        {sessions.loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⏳</div>
            <h3 className={styles.emptyTitle}>
              {language === "en" ? "Loading SportHub schedule..." : "Đang tải lịch tập SportHub..."}
            </h3>
            <p className={styles.emptySubtitle}>
              {language === "en" ? "Please wait a moment." : "Vui lòng chờ trong giây lát."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* Weekly Grid Mode (7 columns of square tiles) */
          <div className={styles.weeklyGridWrapper}>
            <div className={styles.weeklyGrid}>
              {weekDays.map((day) => {
                const daySessions = (sessions.data ?? []).filter((item) =>
                  item.session.startAtUtc.startsWith(day.iso)
                );
                daySessions.sort((a, b) =>
                  a.session.startAtUtc.localeCompare(b.session.startAtUtc)
                );

                return (
                  <div key={day.iso} className={styles.gridColumn}>
                    <div
                      className={`${styles.gridColHeader} ${day.isToday ? styles.gridColHeaderToday : ""}`}
                    >
                      <span className={styles.gridColWeekday}>
                        {day.isToday ? (language === "en" ? "Today" : "Hôm nay") : day.weekday}
                      </span>
                      <span className={styles.gridColDate}>{day.dayLabel}</span>
                      <span className={styles.gridColBadge}>
                        {daySessions.length > 0
                          ? (language === "en" ? `${daySessions.length} classes` : `${daySessions.length} lớp`)
                          : (language === "en" ? "Off" : "Nghỉ")}
                      </span>
                    </div>

                    <div className={styles.gridColBody}>
                      {daySessions.length === 0 ? (
                        <div className={styles.gridEmptyDay}>
                          {language === "en" ? "No classes" : "Không có lớp"}
                        </div>
                      ) : (
                        daySessions.map(({ session, myEnrollmentId }) => {
                          const remainingCapacity = session.capacity - session.confirmedCount;
                          const isEnrolled = !!myEnrollmentId;
                          const isFull = session.isFull || remainingCapacity <= 0;

                          return (
                            <div
                              key={session.sessionId}
                              className={`${styles.gridTile} ${isEnrolled ? styles.gridTileEnrolled : ""}`}
                            >
                              <div className={styles.gridTileTop}>
                                <span className={styles.gridTileTime}>
                                  {formatTime(session.startAtUtc)}
                                </span>
                                <span
                                  className={`${styles.disciplineBadge} ${getDisciplineClass(session.discipline)}`}
                                  style={{ fontSize: "9.5px", padding: "2px 6px" }}
                                >
                                  {session.discipline}
                                </span>
                              </div>

                              <div>
                                <h4
                                  className={styles.gridTileName}
                                  title={session.className}
                                >
                                  {session.className}
                                </h4>
                                <div className={styles.gridTileMeta}>
                                  <span>👤 {session.coachName}</span>
                                  <span>📍 {session.roomName}</span>
                                </div>
                              </div>

                              <div className={styles.gridTileCapacity}>
                                <span>
                                  {session.confirmedCount}/{session.capacity}
                                </span>
                                <span
                                  className={
                                    isFull
                                      ? styles.capacityFull
                                      : styles.capacityAvailable
                                  }
                                >
                                  {isFull
                                    ? (language === "en" ? "Full" : "Hết")
                                    : (language === "en" ? `${remainingCapacity} left` : `Còn ${remainingCapacity}`)}
                                </span>
                              </div>

                              <div>
                                {isEnrolled ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 4,
                                    }}
                                  >
                                    <div className={styles.gridTileEnrolledBadge}>
                                      {language === "en" ? "✓ Enrolled" : "✓ Đã đăng ký"}
                                    </div>
                                    <div style={{ display: "flex", gap: 4 }}>
                                      <button
                                        type="button"
                                        className={styles.calendarBtn}
                                        style={{
                                          flex: 1,
                                          padding: "4px 6px",
                                          fontSize: 11,
                                          justifyContent: "center",
                                        }}
                                        onClick={() => downloadIcs(session)}
                                        title={language === "en" ? "Add to calendar" : "Thêm vào lịch"}
                                      >
                                        📅
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        style={{
                                          flex: 1,
                                          padding: "4px 6px",
                                          fontSize: 11,
                                          textAlign: "center",
                                        }}
                                        disabled={action.busy}
                                        onClick={() =>
                                          setCancellingSession({
                                            enrollmentId: myEnrollmentId,
                                            className: session.className,
                                            startAtUtc: session.startAtUtc,
                                          })
                                        }
                                      >
                                        {language === "en" ? "Cancel" : "Hủy"}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className={`${styles.gridTileBookBtn} ${
                                      isFull || usablePackages.length === 0
                                        ? styles.gridTileBookBtnDisabled
                                        : ""
                                    }`}
                                    disabled={
                                      action.busy ||
                                      isFull ||
                                      usablePackages.length === 0
                                    }
                                    onClick={() => setBookingSession(session)}
                                  >
                                    {isFull
                                      ? (language === "en" ? "Full" : "Hết chỗ")
                                      : usablePackages.length === 0
                                        ? (language === "en" ? "Need Pass" : "Cần gói")
                                        : (language === "en" ? "Book Spot" : "Đặt chỗ")}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : sortedDayKeys.length === 0 ? (
          /* Empty state for cards view */
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📅</div>
            <h3 className={styles.emptyTitle}>
              {language === "en" ? "No sessions found" : "Không tìm thấy buổi tập nào"}
            </h3>
            <p className={styles.emptySubtitle}>
              {language === "en"
                ? "No classes match your selected discipline or date range."
                : "Hiện không có lớp học nào phù hợp với bộ môn hoặc khoảng thời gian bạn đã chọn."}
            </p>
            <button
              type="button"
              className={styles.resetFiltersBtn}
              onClick={() => {
                setDiscipline("");
                setSelectedDayFilter(null);
                setFromDate(todayIso());
                setToDate(addDaysIso(todayIso(), 13));
              }}
            >
              {language === "en" ? "Reset All Filters" : "Đặt lại tất cả bộ lọc"}
            </button>
          </div>
        ) : (
          /* Cards view */
          <div className={styles.classList}>
            {sortedDayKeys.map((dayKey) => {
              const daySessions = groupedSessions[dayKey];
              return (
                <div key={dayKey} className={styles.dateGroup}>
                  <div className={styles.dateGroupHeader}>
                    <h2 className={styles.dateGroupTitle}>{formatDayTitle(dayKey)}</h2>
                    <span className={styles.dateGroupBadge}>
                      {daySessions.length} {language === "en" ? "classes" : "lớp học"}
                    </span>
                  </div>

                  <div className={styles.cardsGrid}>
                    {daySessions.map(({ session, myEnrollmentId }) => {
                      const remainingCapacity = session.capacity - session.confirmedCount;
                      const durationMins = calculateDurationMinutes(
                        session.startAtUtc,
                        session.endAtUtc,
                      );
                      const isEnrolled = !!myEnrollmentId;
                      const isFull = session.isFull || remainingCapacity <= 0;
                      const fillPercent = Math.min(
                        100,
                        Math.round((session.confirmedCount / session.capacity) * 100),
                      );

                      return (
                        <div
                          key={session.sessionId}
                          className={`${styles.classCard} ${isEnrolled ? styles.classCardEnrolled : ""}`}
                        >
                          <div className={styles.cardTop}>
                            <div className={styles.timeBlock}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className={styles.startTime}>
                                  {formatTime(session.startAtUtc)}
                                </span>
                                <span className={styles.timeTag}>
                                  {getTimeOfDayTag(session.startAtUtc)}
                                </span>
                              </div>
                              <span className={styles.duration}>
                                {durationMins} {language === "en" ? "mins" : "phút"} · {language === "en" ? "Until" : "Đến"} {formatTime(session.endAtUtc)}
                              </span>
                            </div>

                            <span
                              className={`${styles.disciplineBadge} ${getDisciplineClass(session.discipline)}`}
                            >
                              {session.discipline}
                            </span>
                          </div>

                          <div className={styles.cardBody}>
                            <h3 className={styles.className}>{session.className}</h3>

                            <div className={styles.metaRow}>
                              <span className={styles.metaItem}>
                                👤 <strong>{language === "en" ? `Coach ${session.coachName}` : session.coachName}</strong>
                              </span>
                              <span className={styles.metaItem}>
                                📍 {session.roomName}
                              </span>
                            </div>

                            <div className={styles.capacitySection}>
                              <div className={styles.capacityText}>
                                <span>
                                  {language === "en" ? "Capacity: " : "Sức chứa: "}
                                  {session.confirmedCount}/{session.capacity}
                                </span>
                                <span>
                                  {isFull
                                    ? (language === "en" ? "Full capacity" : "Đã kín chỗ")
                                    : (language === "en" ? `${remainingCapacity} spots remaining` : `Còn ${remainingCapacity} chỗ trống`)}
                                </span>
                              </div>
                              <div className={styles.capacityBarBg}>
                                <div
                                  className={`${styles.capacityBarFill} ${isFull ? styles.capacityBarFull : ""}`}
                                  style={{ width: `${fillPercent}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className={styles.cardFooter}>
                            {isEnrolled ? (
                              <>
                                <span className={styles.enrolledBadge}>
                                  {language === "en" ? "✓ Enrolled" : "✓ Đã đăng ký"}
                                </span>
                                <div className={styles.enrolledActions}>
                                  <button
                                    type="button"
                                    className={styles.calendarBtn}
                                    onClick={() => downloadIcs(session)}
                                    title={language === "en" ? "Add to calendar" : "Thêm buổi tập này vào lịch"}
                                  >
                                    📅 {language === "en" ? "Calendar" : "Lịch"}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.cancelBtn}
                                    disabled={action.busy}
                                    onClick={() =>
                                      setCancellingSession({
                                        enrollmentId: myEnrollmentId,
                                        className: session.className,
                                        startAtUtc: session.startAtUtc,
                                      })
                                    }
                                  >
                                    {language === "en" ? "Cancel Spot" : "Hủy chỗ"}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={`${styles.bookBtn} ${
                                  isFull || usablePackages.length === 0
                                    ? styles.bookBtnDisabled
                                    : ""
                                }`}
                                disabled={
                                  action.busy ||
                                  isFull ||
                                  usablePackages.length === 0
                                }
                                onClick={() => setBookingSession(session)}
                              >
                                {isFull
                                  ? (language === "en" ? "Class Full" : "Lớp đã hết chỗ")
                                  : usablePackages.length === 0
                                    ? (language === "en" ? "Pass Required" : "Cần có gói tập")
                                    : (language === "en" ? "Book Spot" : "Đặt chỗ ngay")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Booking Confirmation Modal */}
        {bookingSession && (
          <div
            className={styles.modalBackdrop}
            onClick={() => setBookingSession(null)}
          >
            <div
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>
                  {language === "en" ? "Confirm Class Enrollment" : "Xác nhận đặt chỗ"}
                </h3>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setBookingSession(null)}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalSessionSummary}>
                <div className={styles.modalSessionName}>
                  {bookingSession.className}
                </div>
                <div className={styles.modalSessionMeta}>
                  {language === "en" ? "⏰ Time: " : "⏰ Thời gian: "}
                  {formatDate(bookingSession.startAtUtc)} {language === "en" ? "at" : "lúc"}{" "}
                  {formatTime(bookingSession.startAtUtc)} – {formatTime(bookingSession.endAtUtc)}
                  <br />
                  {language === "en" ? "📍 Room: " : "📍 Địa điểm: "}
                  {bookingSession.roomName}
                  <br />
                  {language === "en" ? "👤 Coach: " : "👤 Huấn luyện viên: "}
                  {bookingSession.coachName}
                </div>
              </div>

              <div className={styles.modalNotice}>
                {language === "en" ? (
                  <>
                    <strong>Cancellation Policy (BR-18, BR-50):</strong> 1 session will be deducted from your active package upon booking. 
                    If cancelled at least 2 hours before class starts, your session will be refunded back immediately.
                  </>
                ) : (
                  <>
                    <strong>Quy định hủy lớp (BR-18, BR-50):</strong> Buổi tập sẽ bị trừ vào gói của bạn khi đặt.
                    Nếu hủy đúng hạn trước giờ tập, lượt tập sẽ được hoàn trả lại gói ngay lập tức.
                  </>
                )}
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancelBtn}
                  onClick={() => setBookingSession(null)}
                  disabled={action.busy}
                >
                  {language === "en" ? "Cancel" : "Bỏ qua"}
                </button>
                <button
                  type="button"
                  className={styles.modalConfirmBtn}
                  onClick={() => void handleEnroll()}
                  disabled={action.busy}
                >
                  {action.busy
                    ? (language === "en" ? "Processing..." : "Đang xử lý...")
                    : (language === "en" ? "Confirm & Secure Spot" : "Xác nhận đặt lớp")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Confirmation Modal */}
        {cancellingSession && (
          <div
            className={styles.modalBackdrop}
            onClick={() => setCancellingSession(null)}
          >
            <div
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>
                  {language === "en" ? "Cancel Class Booking" : "Xác nhận hủy chỗ"}
                </h3>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setCancellingSession(null)}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalSessionSummary}>
                <div className={styles.modalSessionName}>
                  {cancellingSession.className}
                </div>
                <div className={styles.modalSessionMeta}>
                  {language === "en" ? "⏰ Session Time: " : "⏰ Lớp diễn ra: "}
                  {formatDate(cancellingSession.startAtUtc)} {language === "en" ? "at" : "lúc"}{" "}
                  {formatTime(cancellingSession.startAtUtc)}
                </div>
              </div>

              <div className={styles.modalNotice}>
                {language === "en"
                  ? "Are you sure you want to cancel this booking? If cancelled at least 2 hours prior to start time, your session will be refunded back to your package."
                  : "Bạn có chắc chắn muốn hủy đăng ký lớp này? Nếu hủy trước thời hạn quy định, buổi tập sẽ được hoàn lại vào gói của bạn."}
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancelBtn}
                  onClick={() => setCancellingSession(null)}
                  disabled={action.busy}
                >
                  {language === "en" ? "Keep Spot" : "Giữ lại"}
                </button>
                <button
                  type="button"
                  className={styles.modalDangerBtn}
                  onClick={() => void handleCancelEnrollment()}
                  disabled={action.busy}
                >
                  {action.busy
                    ? (language === "en" ? "Cancelling..." : "Đang hủy...")
                    : (language === "en" ? "Confirm Cancellation" : "Xác nhận hủy")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MemberShell>
  );
}
