"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { Feedback } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime, formatTime } from "@/lib/format";
import { useAction, useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { EnrollmentDto } from "@/lib/types";
import {
  IconCheck,
  IconTip,
  IconUser,
  IconLocation,
  IconAlert,
  IconCalendar,
  IconClock,
  IconClose,
  StickerRegistrationsEmpty,
} from "@/components/icons";
import styles from "./my-registrations.module.css";

type FilterTab = "all" | "upcoming" | "attended" | "cancelled";

export default function MyEnrollmentsPage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [cancellingItem, setCancellingItem] = useState<EnrollmentDto | null>(null);

  // Keyboard Escape listener for cancel modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cancellingItem) {
        setCancellingItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancellingItem]);

  const action = useAction();
  const now = useNow();

  const enrollments = useApi(
    (signal) =>
      api.get<EnrollmentDto[]>("/api/members/me/enrollments", {
        signal,
      }),
    [],
  );

  const list = useMemo(() => enrollments.data ?? [], [enrollments.data]);

  // Categorize counts
  const counts = useMemo(() => {
    let upcoming = 0;
    let attended = 0;
    let cancelled = 0;

    for (const item of list) {
      const isPast = new Date(item.session.startAtUtc).getTime() <= now;
      if (item.status === "Cancelled") {
        cancelled++;
      } else if (item.attendanceStatus === "Attended") {
        attended++;
      } else if (item.status === "Confirmed" && !isPast) {
        upcoming++;
      }
    }

    return { all: list.length, upcoming, attended, cancelled };
  }, [list, now]);

  // Filtered list based on active tab
  const filteredList = useMemo(() => {
    return list.filter((item) => {
      const isPast = new Date(item.session.startAtUtc).getTime() <= now;
      if (activeTab === "upcoming") {
        return item.status === "Confirmed" && !isPast;
      }
      if (activeTab === "attended") {
        return item.attendanceStatus === "Attended";
      }
      if (activeTab === "cancelled") {
        return item.status === "Cancelled";
      }
      return true;
    });
  }, [list, activeTab, now]);

  const handleCancel = async () => {
    if (!cancellingItem) return;

    const isEligible = new Date(cancellingItem.cancellationDeadlineUtc).getTime() > now;
    const successMsg =
      language === "en"
        ? isEligible
          ? "Cancellation successful! Your session credit has been returned to your active package."
          : "Class cancelled (Past cancellation deadline, no session refund according to policy)."
        : isEligible
          ? "Hủy chỗ thành công! Lượt tập đã được hoàn trả về gói của bạn."
          : "Đã hủy lớp (Quá hạn hủy nên không được hoàn lượt tập theo quy định).";

    const done = await action.run(
      () => api.post(`/api/enrollments/${cancellingItem.enrollmentId}/cancel`),
      successMsg,
    );

    if (done !== null) {
      setCancellingItem(null);
      await enrollments.reload();
    }
  };

  const downloadIcs = (enrollment: EnrollmentDto) => {
    const s = enrollment.session;
    const start = new Date(s.startAtUtc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = new Date(s.endAtUtc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//SportHub//Member Hub//${language.toUpperCase()}`,
      "BEGIN:VEVENT",
      `SUMMARY:${language === "en" ? "Class" : "Lớp"} ${s.className} (${s.discipline})`,
      `DESCRIPTION:${language === "en" ? "Coach" : "HLV"}: ${s.coachName} - ${language === "en" ? "Room" : "Phòng"}: ${s.roomName}`,
      `LOCATION:SportHub - ${s.roomName}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sporthub-${s.className.toLowerCase().replace(/\s+/g, "-")}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (item: EnrollmentDto) => {
    if (item.status === "Cancelled") {
      return (
        <span className={`${styles.statusPill} ${styles.statusCancelled}`}>
          {language === "en" ? "Cancelled" : "Đã hủy"}
        </span>
      );
    }
    if (item.attendanceStatus === "Attended") {
      return (
        <span className={`${styles.statusPill} ${styles.statusAttended}`}>
          <IconCheck size={12} style={{ marginRight: 3 }} />
          {language === "en" ? "Attended" : "Đã tham gia"}
        </span>
      );
    }
    if (item.attendanceStatus === "Absent") {
      return (
        <span className={`${styles.statusPill} ${styles.statusAbsent}`}>
          {language === "en" ? "Absent" : "Vắng mặt"}
        </span>
      );
    }
    return (
      <span className={`${styles.statusPill} ${styles.statusConfirmed}`}>
        <IconCheck size={12} style={{ marginRight: 3 }} />
        {language === "en" ? "Confirmed" : "Đã xác nhận"}
      </span>
    );
  };

  return (
    <MemberShell
      title={language === "en" ? "My Workout Schedule" : "Lịch tập của tôi"}
      description={
        language === "en"
          ? "Manage booked workout sessions, cancellation policies, and workout history"
          : "Quản lý các lớp học đã đặt, thời hạn hủy hoàn buổi và lịch sử rèn luyện"
      }
    >
      <div className={styles.container}>
        {/* Action & Filter Banner */}
        <div className={styles.actionBanner}>
          <div className={styles.filterTabs} role="tablist" aria-label={language === "en" ? "Registration status filters" : "Bộ lọc trạng thái đăng ký"}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "all"}
              className={`${styles.filterTab} ${activeTab === "all" ? styles.filterTabActive : ""}`}
              onClick={() => setActiveTab("all")}
            >
              <span>{language === "en" ? "All" : "Tất cả"}</span>
              <span className={styles.filterBadge}>{counts.all}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "upcoming"}
              className={`${styles.filterTab} ${activeTab === "upcoming" ? styles.filterTabActive : ""}`}
              onClick={() => setActiveTab("upcoming")}
            >
              <span>{language === "en" ? "Upcoming" : "Sắp diễn ra"}</span>
              <span className={styles.filterBadge}>{counts.upcoming}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "attended"}
              className={`${styles.filterTab} ${activeTab === "attended" ? styles.filterTabActive : ""}`}
              onClick={() => setActiveTab("attended")}
            >
              <span>{language === "en" ? "Attended" : "Đã hoàn thành"}</span>
              <span className={styles.filterBadge}>{counts.attended}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cancelled"}
              className={`${styles.filterTab} ${activeTab === "cancelled" ? styles.filterTabActive : ""}`}
              onClick={() => setActiveTab("cancelled")}
            >
              <span>{language === "en" ? "Cancelled" : "Đã hủy"}</span>
              <span className={styles.filterBadge}>{counts.cancelled}</span>
            </button>
          </div>

          <Link href="/member/class-schedule" className={styles.bookMoreBtn}>
            <span>{language === "en" ? "+ Book More Classes" : "+ Đặt thêm lớp mới"}</span>
          </Link>
        </div>

        {/* Policy Hint Banner */}
        <div className={styles.policyHint}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <IconTip size={18} style={{ color: "var(--navy, #1a2b4c)", marginTop: 2, flexShrink: 0 }} />
            <div>
              <strong>{language === "en" ? "Cancellation & Refund Policy: " : "Quy định hủy hoàn buổi tập: "}</strong>
              {language === "en"
                ? "Each session has an assigned cutoff deadline upon booking. Cancelling prior to this deadline automatically credits the session back to your membership package."
                : "Hạn hủy của từng buổi tập được ấn định ngay lúc bạn đăng ký. Nếu bạn hủy trước thời hạn này, buổi tập sẽ được tự động hoàn lại vào gói tập của bạn."}
            </div>
          </div>
        </div>

        {/* Action feedback */}
        {(action.error || action.success) && (
          <Feedback error={action.error} success={action.success} />
        )}

        {/* Registrations List Content */}
        {enrollments.loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} aria-hidden="true">
              <IconClock size={36} />
            </div>
            <h3 className={styles.emptyTitle}>
              {language === "en" ? "Loading registered sessions..." : "Đang tải danh sách lịch tập..."}
            </h3>
            <p className={styles.emptySubtitle}>
              {language === "en" ? "Please wait a moment." : "Vui lòng chờ trong giây lát."}
            </p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className={styles.emptyState}>
            <StickerRegistrationsEmpty size={80} style={{ marginBottom: 12 }} />
            <h3 className={styles.emptyTitle}>
              {activeTab === "upcoming"
                ? (language === "en" ? "You have no upcoming workout sessions scheduled" : "Bạn chưa có lớp tập nào sắp diễn ra")
                : activeTab === "attended"
                  ? (language === "en" ? "No completed workouts yet" : "Chưa có buổi tập nào đã hoàn thành")
                  : activeTab === "cancelled"
                    ? (language === "en" ? "No cancelled workouts" : "Không có buổi tập nào bị hủy")
                    : (language === "en" ? "You haven't enrolled in any classes yet" : "Bạn chưa đăng ký lớp tập nào")}
            </h3>
            <p className={styles.emptySubtitle}>
              {language === "en"
                ? "Explore this week's timetable with energetic Yoga, GroupX, and PT sessions at SportHub!"
                : "Khám phá ngay lịch tập tuần này với các lớp Yoga, GroupX và PT sôi động tại SportHub!"}
            </p>
            <Link href="/member/class-schedule" className={styles.emptyCtaBtn}>
              {language === "en" ? "Explore Class Schedule Now" : "Khám phá lịch lớp ngay"}
            </Link>
          </div>
        ) : (
          <div
            className={styles.registrationList}
            role="tabpanel"
            aria-label={language === "en" ? "Registrations list" : "Danh sách đăng ký"}
          >
            {filteredList.map((item) => {
              const startDate = new Date(item.session.startAtUtc);
              const isPast = startDate.getTime() <= now;
              const deadlineDate = new Date(item.cancellationDeadlineUtc);
              const deadlinePassed = deadlineDate.getTime() <= now;
              const canCancel = item.status === "Confirmed" && !isPast;

              const dayNumber = startDate.getDate();
              const monthLabel = language === "en"
                ? startDate.toLocaleString("en", { month: "short" }).toUpperCase()
                : `Thg ${startDate.getMonth() + 1}`;

              return (
                <div
                  key={item.enrollmentId}
                  className={`${styles.workoutCard} ${isPast ? styles.workoutCardPast : ""}`}
                >
                  {/* Left: Date box & class info */}
                  <div className={styles.cardLeft}>
                    <div
                      className={`${styles.dateBox} ${!isPast && item.status === "Confirmed" ? styles.dateBoxUpcoming : ""}`}
                    >
                      <span className={styles.dateBoxDay}>{dayNumber}</span>
                      <span className={styles.dateBoxMonth}>{monthLabel}</span>
                    </div>

                    <div className={styles.classInfo}>
                      <div className={styles.timeRow}>
                        <span style={{ display: "inline-flex", alignItems: "center" }}>
                          <IconClock size={13} style={{ marginRight: 4 }} />
                          {formatTime(item.session.startAtUtc)} – {formatTime(item.session.endAtUtc)}
                        </span>
                        <span>·</span>
                        <span>{item.session.discipline}</span>
                      </div>
                      <h3 className={styles.className}>{item.session.className}</h3>
                      <div className={styles.metaRow}>
                        <span className={styles.metaItem}>
                          <IconUser size={14} style={{ marginRight: 4 }} />
                          {language === "en" ? `Coach ${item.session.coachName}` : item.session.coachName}
                        </span>
                        <span className={styles.metaItem}>
                          <IconLocation size={14} style={{ marginRight: 4 }} />
                          {item.session.roomName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Center: Deadline Status */}
                  <div className={styles.cardCenter}>
                    {canCancel && (
                      deadlinePassed ? (
                        <span className={styles.deadlinePassed}>
                          <IconAlert size={14} style={{ marginRight: 4, flexShrink: 0 }} />
                          {language === "en"
                            ? "Past cancellation deadline (No session refund)"
                            : "Đã quá hạn hủy (Hủy sẽ không hoàn lượt)"}
                        </span>
                      ) : (
                        <span className={styles.deadlineActive}>
                          <IconClock size={14} style={{ marginRight: 4, flexShrink: 0 }} />
                          {language === "en"
                            ? `Free cancellation until: ${formatDateTime(item.cancellationDeadlineUtc)}`
                            : `Hạn hủy hoàn buổi: ${formatDateTime(item.cancellationDeadlineUtc)}`}
                        </span>
                      )
                    )}
                  </div>

                  {/* Right: Status Pill & Actions */}
                  <div className={styles.cardRight}>
                    {getStatusBadge(item)}

                    {/* Add to Calendar button */}
                    <button
                      type="button"
                      className={styles.calendarBtn}
                      onClick={() => downloadIcs(item)}
                      title={language === "en" ? "Download .ics calendar event" : "Tải file .ics để thêm vào Google hoặc Apple Calendar"}
                    >
                      <IconCalendar size={14} style={{ marginRight: 5 }} />
                      {language === "en" ? "Add to Calendar" : "Thêm vào lịch"}
                    </button>

                    {/* Cancel action */}
                    {canCancel && (
                      <button
                        type="button"
                        className={styles.cancelActionBtn}
                        disabled={action.busy}
                        onClick={() => setCancellingItem(item)}
                      >
                        {language === "en" ? "Cancel Spot" : "Hủy buổi"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cancellation Confirmation Modal */}
        {cancellingItem && (
          <div
            className={styles.modalBackdrop}
            onClick={() => setCancellingItem(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-reg-title"
          >
            <div
              className={styles.modalCard}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <h3 id="cancel-reg-title" className={styles.modalTitle}>
                  {language === "en" ? "Confirm Class Cancellation" : "Xác nhận hủy lớp tập"}
                </h3>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setCancellingItem(null)}
                  aria-label={language === "en" ? "Close dialog" : "Đóng cửa sổ"}
                >
                  <IconClose size={18} />
                </button>
              </div>

              <div className={styles.modalSessionSummary}>
                <div className={styles.modalSessionName}>
                  {cancellingItem.session.className}
                </div>
                <div className={styles.modalSessionMeta}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <IconClock size={14} />
                    {language === "en" ? "Time: " : "Giờ tập: "}
                    {formatDateTime(cancellingItem.session.startAtUtc)}
                  </span>
                  <br />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <IconLocation size={14} />
                    {language === "en" ? "Room: " : "Phòng: "}
                    {cancellingItem.session.roomName}
                  </span>
                  <br />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <IconUser size={14} />
                    {language === "en" ? "Coach: " : "HLV: "}
                    {cancellingItem.session.coachName}
                  </span>
                </div>
              </div>

              {new Date(cancellingItem.cancellationDeadlineUtc).getTime() > now ? (
                <div className={styles.modalRefundNotice}>
                  {language === "en" ? (
                    <>
                      <IconCheck size={16} style={{ display: 'inline-block', verticalAlign: 'sub', marginRight: 6 }} />
                      <strong>Eligible for Session Credit:</strong> You are cancelling ahead of the deadline ({formatDateTime(cancellingItem.cancellationDeadlineUtc)}). 
                      This session will be <strong>credited back to your package</strong> immediately upon confirmation.
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} style={{ display: 'inline-block', verticalAlign: 'sub', marginRight: 6 }} />
                      <strong>Đủ điều kiện hoàn lượt:</strong> Bạn đang thực hiện hủy trước hạn chót ({formatDateTime(cancellingItem.cancellationDeadlineUtc)}). 
                      Buổi tập này sẽ được <strong>hoàn trả 1 lượt</strong> vào gói tập của bạn ngay sau khi xác nhận.
                    </>
                  )}
                </div>
              ) : (
                <div className={styles.modalNoRefundNotice}>
                  {language === "en" ? (
                    <>
                      <IconAlert size={16} style={{ display: 'inline-block', verticalAlign: 'sub', marginRight: 6 }} />
                      <strong>Past Cancellation Deadline:</strong> The cancellation cutoff has expired ({formatDateTime(cancellingItem.cancellationDeadlineUtc)}). 
                      If you cancel now, <strong>this session will not be refunded</strong> to your package.
                    </>
                  ) : (
                    <>
                      <IconAlert size={16} style={{ display: 'inline-block', verticalAlign: 'sub', marginRight: 6 }} />
                      <strong>Đã quá hạn hủy:</strong> Thời hạn chốt hủy đã trôi qua ({formatDateTime(cancellingItem.cancellationDeadlineUtc)}). 
                      Nếu bạn hủy vào lúc này, <strong>buổi tập sẽ không được hoàn trả</strong> vào gói.
                    </>
                  )}
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancelBtn}
                  onClick={() => setCancellingItem(null)}
                  disabled={action.busy}
                >
                  {language === "en" ? "Keep My Spot" : "Giữ buổi tập"}
                </button>
                <button
                  type="button"
                  className={styles.modalDangerBtn}
                  onClick={() => void handleCancel()}
                  disabled={action.busy}
                >
                  {action.busy
                    ? (language === "en" ? "Cancelling..." : "Đang hủy...")
                    : (language === "en" ? "Confirm Cancellation" : "Xác nhận hủy lớp")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MemberShell>
  );
}
