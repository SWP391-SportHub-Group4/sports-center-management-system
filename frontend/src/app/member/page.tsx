"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { MemberShell } from "@/components/MemberShell";
import { AsyncSection, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type {
  EnrollmentDto,
  MemberPackageDto,
  Paged,
  InvoiceSummaryDto,
} from "@/lib/types";
import {
  IconQrCode,
  IconFlame,
  IconCheck,
  IconCalendar,
  IconClock,
  IconLocation,
  IconUser,
  IconDumbbell,
  IconYoga,
  IconRunner,
  IconSwim,
  IconClose,
  IconRefresh,
  StickerCalendarEmpty,
  StickerGatePass,
} from "@/components/icons";
import styles from "./member.module.css";

export default function MemberDashboardPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );

  const upcoming = useApi(
    (signal) =>
      api.get<EnrollmentDto[]>("/api/members/me/enrollments", {
        signal,
        query: { upcomingOnly: true },
      }),
    [],
  );

  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal,
        query: { pageSize: 5 },
      }),
    [],
  );

  const [qrSeconds, setQrSeconds] = useState(60);

  // Generate QR code for check-in
  const generateQr = useCallback(() => {
    if (!user) return;
    const checkinPayload = JSON.stringify({
      userId: user.userId,
      fullName: user.fullName,
      role: user.role,
      type: "SPORTHUB_MEMBER_CHECKIN",
      nonce: Math.random().toString(36).slice(2, 10),
      issuedAt: new Date().toISOString(),
    });

    QRCode.toDataURL(checkinPayload, {
      width: 240,
      margin: 2,
      color: { dark: "#1a2b4c", light: "#ffffff" },
    })
      .then((url) => {
        setQrCodeUrl(url);
        setQrSeconds(60);
      })
      .catch(() => setQrCodeUrl(""));
  }, [user]);

  const handleOpenQr = () => {
    generateQr();
    setShowQrModal(true);
  };

  useEffect(() => {
    generateQr();
  }, [generateQr]);

  useEffect(() => {
    if (!showQrModal) return;
    const timer = setInterval(() => {
      setQrSeconds((prev) => {
        if (prev <= 1) {
          generateQr();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [generateQr, showQrModal]);

  const usable = (packages.data ?? []).filter((p) => p.isUsable);
  const remaining = usable.reduce(
    (acc, p) => acc + (p.remainingSessions ?? 0),
    0,
  );
  const hasUnlimited = usable.some((p) => p.remainingSessions === null);

  const weeklyRhythm = useMemo(() => {
    const days = [
      { label: "M", full: "Monday", fullVi: "T2", index: 1 },
      { label: "T", full: "Tuesday", fullVi: "T3", index: 2 },
      { label: "W", full: "Wednesday", fullVi: "T4", index: 3 },
      { label: "T", full: "Thursday", fullVi: "T5", index: 4 },
      { label: "F", full: "Friday", fullVi: "T6", index: 5 },
      { label: "S", full: "Saturday", fullVi: "T7", index: 6 },
      { label: "S", full: "Sunday", fullVi: "CN", index: 0 },
    ];
    const now = new Date();
    const currentDayIndex = now.getDay();
    const activeDayIndices = new Set(
      (upcoming.data ?? []).map((e) =>
        new Date(e.session.startAtUtc).getDay(),
      ),
    );
    return days.map((d) => ({
      ...d,
      isToday: d.index === currentDayIndex,
      hasSession: activeDayIndices.has(d.index),
    }));
  }, [upcoming.data]);

  const nextSession =
    upcoming.data && upcoming.data.length > 0 ? upcoming.data[0] : null;

  const outstanding = (invoices.data?.items ?? []).reduce(
    (acc, inv) =>
      inv.status !== "Paid" && inv.status !== "Cancelled"
        ? acc + (inv.outstanding ?? 0)
        : acc,
    0,
  );

  const downloadIcs = (enrollment: EnrollmentDto) => {
    const s = enrollment.session;
    const start = new Date(s.startAtUtc);
    const end = new Date(s.endAtUtc);

    const pad = (n: number) => String(n).padStart(2, "0");
    const toIcsDate = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//SportHub//Member Hub//${language.toUpperCase()}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:sporthub-enrollment-${enrollment.enrollmentId}@sporthub.vn`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${s.className} - SportHub`,
      `DESCRIPTION:Class: ${s.className}\\nCoach: ${s.coachName}\\nRoom: ${s.roomName}\\nDiscipline: ${s.discipline || "Workout"}`,
      `LOCATION:${s.roomName}, SportHub Center`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sporthub-class-${s.sessionId}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCancelEnrollment = async (enrollmentId: string) => {
    const confirmMsg =
      language === "en"
        ? "Are you sure you want to cancel this booking? If cancelled at least 2 hours prior to start, your session will be refunded."
        : "Bạn có chắc chắn muốn hủy đăng ký lớp này? Buổi tập sẽ được hoàn lại vào gói nếu hủy trước giờ học tối thiểu 2 tiếng.";
    if (!window.confirm(confirmMsg)) return;

    try {
      setCancellingId(enrollmentId);
      await api.post(`/api/enrollments/${enrollmentId}/cancel`, {});
      await upcoming.reload();
      await packages.reload();
      alert(
        language === "en"
          ? "Booking successfully cancelled."
          : "Đã hủy đăng ký lớp thành công.",
      );
    } catch (err: unknown) {
      alert(
        err instanceof Error
          ? err.message
          : language === "en"
            ? "Could not cancel booking."
            : "Không thể hủy lớp học lúc này.",
      );
    } finally {
      setCancellingId(null);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (language === "en") {
      if (hour < 12) return "Good morning";
      if (hour < 18) return "Good afternoon";
      return "Good evening";
    }
    if (hour < 12) return "Chào buổi sáng";
    if (hour < 18) return "Chào buổi chiều";
    return "Chào buổi tối";
  };

  return (
    <MemberShell
      title={language === "en" ? "Member Space" : "Không gian hội viên"}
      description={
        language === "en"
          ? "Manage workout schedules, membership passes, and your sports journey at SportHub"
          : "Quản lý lịch tập, gói tập và trải nghiệm thể thao tại SportHub"
      }
      allow={["Member"]}
    >
      <div className={styles.dashboard}>
        {/* ---------- Welcome Hero ---------- */}
        <section className={styles.welcomeHero} aria-labelledby="welcome-title">
          <Image
            src="/sporthub/hero-right.jpg"
            alt=""
            fill
            className={styles.heroBgImage}
            sizes="(max-width: 768px) 100vw, 55vw"
            priority
            unoptimized
            aria-hidden="true"
          />
          <div className={styles.heroContent}>
            <h2 id="welcome-title" className={styles.heroTitle}>
              {getGreeting()}, {user?.fullName ?? (language === "en" ? "there" : "bạn")}!
            </h2>
            <p className={styles.heroSubtitle}>
              {language === "en"
                ? "Track schedules, membership passes, and check in at SportHub turnstiles."
                : "Theo dõi lịch tập, gói hội viên và quét mã check-in tại cổng SportHub."}
            </p>
          </div>

          <div className={styles.heroPass}>
            <div className={styles.passCard}>
              <div className={styles.passIcon} aria-hidden="true">
                {user?.fullName ? user.fullName.charAt(0).toUpperCase() : "S"}
              </div>
              <div className={styles.passInfo}>
                <span className={styles.passTier}>
                  {usable.length > 0
                    ? (usable[0]?.packageName || (language === "en" ? "Active Member" : "Hội viên đang hoạt động"))
                    : (language === "en" ? "Member Account" : "Tài khoản thành viên")}
                </span>
                <span className={styles.passName}>
                  {user?.fullName ?? "Member"}
                </span>
              </div>
            </div>

            <div className={styles.heroActionRow}>
              <Link href="/member/class-schedule" className={styles.heroBrowseBtn}>
                <IconCalendar size={16} />
                <span>{language === "en" ? "Book a Class" : "Đặt lịch lớp"}</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- Quick Stats Ribbon ---------- */}
        <section className={styles.statGrid} aria-label={language === "en" ? "Overview Statistics" : "Thống kê tổng quan"}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Upcoming Classes" : "Lớp đã đăng ký"}
            </span>
            <span className={styles.statNumber}>
              {upcoming.data?.length ?? 0}
            </span>
            <span className={styles.statDesc}>
              {nextSession
                ? (language === "en"
                    ? `Next: ${formatDate(nextSession.session.startAtUtc)}`
                    : `Gần nhất: ${formatDate(nextSession.session.startAtUtc)}`)
                : (language === "en" ? "No bookings yet · Browse schedule" : "Chưa có lịch · Xem lịch ngay")}
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Remaining Sessions" : "Buổi tập khả dụng"}
            </span>
            <span className={styles.statNumber}>
              {hasUnlimited ? (language === "en" ? "Unlimited" : "Không giới hạn") : remaining}
            </span>
            <span className={styles.statDesc}>
              {hasUnlimited
                ? (language === "en" ? "Unlimited access package active" : "Đang sở hữu gói tập không giới hạn")
                : (language === "en" ? "Total across your active passes" : "Tổng số buổi còn hiệu lực")}
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Active Passes" : "Gói tập đang dùng"}
            </span>
            <span className={styles.statNumber}>{usable.length}</span>
            <span className={styles.statDesc}>
              {usable.length > 0
                ? usable
                    .map((p) => p.packageName)
                    .slice(0, 2)
                    .join(", ")
                : (language === "en" ? "No active membership pass" : "Chưa đăng ký gói tập")}
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Payment Due" : "Cần thanh toán"}
            </span>
            <span className={styles.statNumber}>
              {formatMoney(outstanding)}
            </span>
            <span className={styles.statDesc}>
              {outstanding > 0
                ? (language === "en" ? "Awaiting reception payment" : "Hóa đơn chờ tại quầy lễ tân")
                : (language === "en" ? "All services fully settled (0 ₫)" : "Tất cả dịch vụ đã thanh toán")}
            </span>
          </div>
        </section>

        {/* ---------- 2-Column Dashboard Body ---------- */}
        <div className={styles.dashboardBody}>
          {/* Main Column (~65%) */}
          <div className={styles.mainColumn}>
            {/* Next Workout Spotlight */}
            <section aria-labelledby="next-workout-title">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="next-workout-title" className={styles.sectionTitle}>
                    {language === "en" ? "Your Next Workout Session" : "Buổi tập tiếp theo của bạn"}
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    {language === "en"
                      ? "Please arrive 5–10 minutes early for check-in and warm-up."
                      : "Vui lòng có mặt trước giờ tập 5–10 phút để điểm danh và khởi động."}
                  </p>
                </div>
                <Link
                  className={styles.sectionLink}
                  href="/member/class-schedule"
                >
                  <span>{language === "en" ? "View full schedule" : "Xem lịch toàn bộ lớp"}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              {upcoming.data && upcoming.data.length === 0 ? (
                <div className={styles.emptySpotlight}>
                  <div className={styles.emptySpotlightIcon} aria-hidden="true">
                    <StickerCalendarEmpty size={96} />
                  </div>
                  <h3 className={styles.emptySpotlightTitle}>
                    {language === "en" ? "You have no upcoming workouts scheduled" : "Bạn chưa có buổi tập nào sắp tới"}
                  </h3>
                  <p className={styles.emptySpotlightText}>
                    {language === "en"
                      ? "Reserve your spot in advance to build athletic momentum and secure your spot with your favorite coaches. Select a discipline to explore:"
                      : "Đặt chỗ trước để duy trì phong độ rèn luyện và giữ chỗ cùng huấn luyện viên yêu thích. Chọn bộ môn bạn muốn tập hôm nay:"}
                  </p>

                  <div className={styles.emptyDisciplineGrid} aria-label={language === "en" ? "Filter by discipline" : "Lọc theo bộ môn"}>
                    <Link href="/member/class-schedule" className={styles.emptyDisciplineBtn}>
                      <IconYoga size={16} />
                      <span>Yoga & Pilates</span>
                    </Link>
                    <Link href="/member/class-schedule" className={styles.emptyDisciplineBtn}>
                      <IconFlame size={16} />
                      <span>HIIT & GroupX</span>
                    </Link>
                    <Link href="/member/class-schedule" className={styles.emptyDisciplineBtn}>
                      <IconDumbbell size={16} />
                      <span>Fitness & Gym</span>
                    </Link>
                    <Link href="/member/class-schedule" className={styles.emptyDisciplineBtn}>
                      <IconSwim size={16} />
                      <span>Swim & Recovery</span>
                    </Link>
                  </div>

                  <Link
                    href="/member/class-schedule"
                    className="btn btn--primary btn--sm"
                  >
                    <span>{language === "en" ? "Browse Full Schedule & Book Spot" : "Xem toàn bộ lịch lớp & Đặt chỗ ngay"}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : (
                <AsyncSection
                  state={upcoming}
                  emptyMessage={language === "en" ? "You have no upcoming sessions booked." : "Bạn chưa đăng ký buổi tập nào sắp tới."}
                  isEmpty={(data) => data.length === 0}
                >
                  {(data) => {
                    const current = data[0];
                    const startDate = new Date(current.session.startAtUtc);
                    const dayNum = startDate.getDate();
                    const monthStr = language === "en"
                      ? startDate.toLocaleString("en", { month: "short" }).toUpperCase()
                      : `T${startDate.getMonth() + 1}`;

                    const disc = (current.session.discipline || "").toLowerCase();
                    const DisciplineIcon =
                      disc.includes("yoga") || disc.includes("pilates")
                        ? IconYoga
                        : disc.includes("hiit") || disc.includes("cardio") || disc.includes("burn")
                          ? IconFlame
                          : disc.includes("run") || disc.includes("speed")
                            ? IconRunner
                            : disc.includes("swim")
                              ? IconSwim
                              : IconDumbbell;

                    const getDisciplineHeroImage = (discipline?: string) => {
                      const d = (discipline || "").toLowerCase();
                      if (d.includes("yoga") || d.includes("pilates") || d.includes("mind")) {
                        return "/sporthub/activity-yoga-hd.webp";
                      }
                      if (d.includes("hiit") || d.includes("groupx") || d.includes("burn") || d.includes("cardio") || d.includes("cycle") || d.includes("boxing")) {
                        return "/sporthub/activity-groupx-hd.webp";
                      }
                      if (d.includes("stretch") || d.includes("recovery") || d.includes("mobility")) {
                        return "/sporthub/activity-stretch-hd.webp";
                      }
                      return "/sporthub/activity-fitness-hd.webp";
                    };
                    const heroImg = getDisciplineHeroImage(current.session.discipline);

                    return (
                      <div className={styles.spotlightCard}>
                        <Image
                          src={heroImg}
                          alt=""
                          fill
                          className={styles.spotlightBg}
                          sizes="(max-width: 1080px) 100vw, 65vw"
                          priority
                          unoptimized
                          aria-hidden="true"
                        />
                        <div className={styles.spotlightOverlay} aria-hidden="true" />
                        <div className={styles.spotlightHeader}>
                          <span className={styles.disciplineBadge}>
                            <DisciplineIcon size={16} />
                            <span>{current.session.discipline || (language === "en" ? "Group Class" : "Lớp nhóm")}</span>
                          </span>
                          <span className={styles.deadlineNotice}>
                            {language === "en"
                              ? `Free cancellation deadline: before ${formatDateTime(current.cancellationDeadlineUtc)} (${current.cancellationDeadlineHours}h before class)`
                              : `Hạn hủy miễn phí: trước ${formatDateTime(current.cancellationDeadlineUtc)} (${current.cancellationDeadlineHours}h trước lớp)`}
                          </span>
                        </div>

                        <div className={styles.spotlightBody}>
                          <div className={styles.calendarBox}>
                            <span className={styles.calMonth}>{monthStr}</span>
                            <span className={styles.calDay}>{dayNum}</span>
                          </div>

                          <div className={styles.workoutDetails}>
                            <h3 className={styles.workoutName}>
                              {current.session.className}
                            </h3>
                            <div className={styles.workoutMeta}>
                              <span className={styles.metaItem}>
                                <IconClock size={15} />
                                {formatDateTime(current.session.startAtUtc)}
                              </span>
                              <span className={styles.metaItem}>
                                <IconLocation size={15} />
                                {current.session.roomName}
                              </span>
                              <span className={styles.metaItem}>
                                <IconUser size={15} />
                                {language === "en" ? `Coach ${current.session.coachName}` : `HLV ${current.session.coachName}`}
                              </span>
                            </div>

                            <div className={styles.cancellationBar}>
                              <IconCheck size={16} style={{ color: "#34d399", flexShrink: 0 }} />
                              <span>
                                {language === "en"
                                  ? `Free cancellation until ${formatDateTime(current.cancellationDeadlineUtc)} (2h prior). 100% session refund.`
                                  : `Hủy miễn phí trước ${formatDateTime(current.cancellationDeadlineUtc)} (trước 2 tiếng). Hoàn trả 100% buổi tập.`}
                              </span>
                            </div>
                          </div>

                          <div className={styles.spotlightActions}>
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => downloadIcs(current)}
                              title={language === "en" ? "Save class to calendar (.ics)" : "Lưu buổi tập vào Google/Apple Calendar"}
                              aria-label={language === "en" ? "Add to calendar" : "Lưu vào lịch cá nhân"}
                            >
                              <IconCalendar size={15} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
                              {language === "en" ? "Add to Calendar" : "Lưu vào lịch"}
                            </button>
                            <Link
                              href="/member/my-registrations"
                              className="btn btn--outline btn--sm"
                            >
                              {language === "en" ? "Schedule Details" : "Chi tiết lịch"}
                            </Link>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              style={{ color: "var(--danger-700)" }}
                              disabled={cancellingId === current.enrollmentId}
                              onClick={() =>
                                handleCancelEnrollment(current.enrollmentId)
                              }
                            >
                              {cancellingId === current.enrollmentId
                                ? (language === "en" ? "Cancelling..." : "Đang hủy...")
                                : (language === "en" ? "Cancel Class" : "Hủy lớp")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </AsyncSection>
              )}
            </section>

            {/* Athletic Weekly Rhythm Tracker */}
            <section
              className={styles.rhythmSection}
              aria-label={language === "en" ? "Weekly Training Rhythm" : "Nhịp điệu rèn luyện tuần"}
            >
              <div className={styles.rhythmInfo}>
                <div className={styles.rhythmFlame} aria-hidden="true">
                  <IconFlame size={22} />
                </div>
                <div>
                  <div className={styles.rhythmTitle}>
                    <span>{language === "en" ? "Weekly Rhythm & Consistency" : "Nhịp điệu rèn luyện tuần"}</span>
                    <span className={styles.rhythmBadge}>
                      {weeklyRhythm.filter((d) => d.hasSession).length >= 3
                        ? (language === "en" ? "Consistent Athlete" : "Phong độ cao")
                        : (language === "en" ? "Active Momentum" : "Đang duy trì")}
                    </span>
                  </div>
                  <p className={styles.rhythmSubtitle}>
                    {language === "en"
                      ? `${weeklyRhythm.filter((d) => d.hasSession).length} of 4 target workouts scheduled this week.`
                      : `Đã lên lịch ${weeklyRhythm.filter((d) => d.hasSession).length}/4 buổi tập mục tiêu trong tuần.`}
                  </p>
                  <div className={styles.rhythmProgressBarBg} aria-hidden="true">
                    <div
                      className={styles.rhythmProgressBarFill}
                      style={{
                        transform: `scaleX(${Math.min(1, weeklyRhythm.filter((d) => d.hasSession).length / 4)})`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.rhythmDays} aria-hidden="true">
                {weeklyRhythm.map((day) => (
                  <div
                    key={day.full}
                    className={`${styles.dayPill} ${day.hasSession ? styles.dayPillActive : ""} ${day.isToday ? styles.dayPillToday : ""}`}
                    title={`${language === "en" ? day.full : day.fullVi}${day.hasSession ? " (Scheduled)" : ""}${day.isToday ? " (Today)" : ""}`}
                  >
                    <span>{language === "en" ? day.label : day.fullVi}</span>
                    <span className={styles.dayCheck}>
                      {day.hasSession ? <IconCheck size={12} strokeWidth={2.6} /> : "·"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Active Packages */}
            <section aria-labelledby="packages-title">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="packages-title" className={styles.sectionTitle}>
                    {language === "en" ? "Your Membership Passes" : "Gói tập của bạn"}
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    {language === "en"
                      ? "Active and owned packages in your account"
                      : "Các gói tập và thẻ hội viên đang sở hữu"}
                  </p>
                </div>
                <Link
                  className={styles.sectionLink}
                  href="/member/my-plans"
                >
                  <span>{language === "en" ? "Manage Passes" : "Quản lý gói"}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              <AsyncSection
                state={packages}
                emptyMessage={
                  language === "en"
                    ? "You have not enrolled in any packages. Visit reception to activate a pass."
                    : "Bạn chưa đăng ký gói tập nào. Hãy liên hệ quầy lễ tân để kích hoạt gói."
                }
                isEmpty={(data) => data.length === 0}
              >
                {(data) => (
                  <div className={styles.packageList}>
                    {data.slice(0, 3).map((item) => (
                      <div
                        key={item.memberPackageId}
                        className={styles.packageCard}
                      >
                        <div>
                          <div className={styles.pkgName}>{item.packageName}</div>
                          <div className={styles.pkgDates}>
                            {language === "en"
                              ? `Valid: ${formatDate(item.startDate)} – ${formatDate(item.endDate)}`
                              : `Hiệu lực: ${formatDate(item.startDate)} – ${formatDate(item.endDate)}`}
                          </div>
                        </div>

                        <div className={styles.pkgQuota}>
                          <span className={styles.pkgSessions}>
                            {item.remainingSessions === null
                              ? (language === "en" ? "Unlimited" : "Không giới hạn")
                              : (language === "en" ? `${item.remainingSessions} sessions` : `${item.remainingSessions} buổi`)}
                          </span>
                          <StatusChip value={item.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AsyncSection>
            </section>
          </div>

          {/* Utility Sidebar (~35%) */}
          <aside className={styles.utilitySidebar}>
            {/* Live Turnstile Check-in Pass Card */}
            <div className={styles.turnstileWidget}>
              <div className={styles.turnstileHeader}>
                <div className={styles.turnstileReadyBadge}>
                  <span className={styles.pulseDot} aria-hidden="true" />
                  <span>
                    {language === "en" ? "Turnstile Ready · Optical Gate Pass" : "Sẵn sàng qua cổng · Thẻ vào trung tâm"}
                  </span>
                </div>
                <h3 className={styles.turnstileTitle}>
                  {language === "en" ? "Member Check-in Pass" : "Thẻ Check-in Cổng Turnstile"}
                </h3>
                <p className={styles.turnstileSub}>
                  {language === "en"
                    ? "Present dynamic security QR code at turnstile reader to enter."
                    : "Quét mã QR bảo mật động tại cổng turnstile để vào tập."}
                </p>
              </div>

              <div className={styles.turnstilePassVisual}>
                <StickerGatePass size={68} />
                <span className={styles.turnstilePassTag}>SPORTHUB GATE PASS</span>
              </div>

              <button
                type="button"
                className={styles.openQrPassBtn}
                onClick={handleOpenQr}
                aria-label={language === "en" ? "Show Check-in QR" : "Mở mã QR Check-in"}
                data-testid="show-qr-btn"
              >
                <IconQrCode size={18} />
                <span>{language === "en" ? "Show Check-in QR" : "Mở mã QR Check-in"}</span>
              </button>

              <div className={styles.turnstileSteps}>
                <div className={styles.turnstileStepItem}>
                  <span className={styles.turnstileStepNum}>1</span>
                  <span>
                    {language === "en"
                      ? "Tap button to reveal dynamic security QR code."
                      : "Nhấn nút để hiển thị mã QR động bảo mật."}
                  </span>
                </div>
                <div className={styles.turnstileStepItem}>
                  <span className={styles.turnstileStepNum}>2</span>
                  <span>
                    {language === "en"
                      ? "Hold QR 10–15cm from gate optical reader."
                      : "Đưa mã QR cách mắt đọc cổng 10–15cm."}
                  </span>
                </div>
              </div>

              <div className={styles.turnstileFooter}>
                <div className={styles.turnstileUserMeta}>
                  <span>{user?.fullName ?? "Member"}</span>
                  <span style={{ color: "var(--brand-700)" }}>SportHub Athlete</span>
                </div>
              </div>
            </div>

            {/* Billing Summary & Reception Desk Card */}
            <div className={styles.billingCard}>
              <div className={styles.billingHeader}>
                <div>
                  <span className={styles.sectionSubtitle}>
                    {language === "en" ? "Account Billing" : "Tình trạng thanh toán"}
                  </span>
                  <div className={styles.billingAmount}>
                    {formatMoney(outstanding)}
                  </div>
                </div>
                <StatusChip value={outstanding === 0 ? "Paid" : "Pending"} />
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--ink-700)",
                  lineHeight: 1.5,
                }}
              >
                {outstanding > 0
                  ? (language === "en"
                      ? "You have pending service invoices. Please settle directly at the SportHub reception desk."
                      : "Bạn có hóa đơn dịch vụ chưa thanh toán. Vui lòng thanh toán trực tiếp tại quầy lễ tân SportHub.")
                  : (language === "en"
                      ? "All your service invoices and class passes are fully settled. Thank you!"
                      : "Tất cả hóa đơn dịch vụ và gói tập của bạn đã được thanh toán đầy đủ. Cảm ơn bạn!")}
              </p>

              <div>
                <Link
                  href="/member/invoices"
                  className="btn btn--secondary btn--sm"
                  style={{ width: "100%", textAlign: "center" }}
                >
                  {language === "en" ? "View Invoice History" : "Xem lịch sử hóa đơn"}
                </Link>
              </div>
            </div>

            {/* Quick Athletic Shortcuts */}
            <div className={styles.quickActionsCard}>
              <h3 className={styles.quickActionsTitle}>
                {language === "en" ? "Quick Athletic Shortcuts" : "Lối tắt tập luyện"}
              </h3>
              <div className={styles.quickActionsList}>
                <Link href="/member/class-schedule" className={styles.quickActionItem}>
                  <div className={styles.quickActionLeft}>
                    <div className={styles.quickActionThumbBox} aria-hidden="true">
                      <Image
                        src="/sporthub/facility-studio.jpg"
                        alt=""
                        fill
                        loading="eager"
                        unoptimized
                        className={styles.quickActionThumb}
                        sizes="46px"
                      />
                    </div>
                    <div className={styles.quickActionInfo}>
                      <span className={styles.quickActionLabel}>
                        {language === "en" ? "Class Schedule" : "Lịch toàn bộ lớp học"}
                      </span>
                      <span className={styles.quickActionDesc}>
                        {language === "en" ? "Browse 50+ weekly group sessions" : "Xem hơn 50 lớp tập hàng tuần"}
                      </span>
                    </div>
                  </div>
                  <span className={styles.quickActionArrow} aria-hidden="true">→</span>
                </Link>
                <Link href="/member/training" className={styles.quickActionItem}>
                  <div className={styles.quickActionLeft}>
                    <div className={styles.quickActionThumbBox} aria-hidden="true">
                      <Image
                        src="/sporthub/activity-fitness.webp"
                        alt=""
                        fill
                        loading="eager"
                        unoptimized
                        className={styles.quickActionThumb}
                        sizes="46px"
                      />
                    </div>
                    <div className={styles.quickActionInfo}>
                      <span className={styles.quickActionLabel}>
                        {language === "en" ? "Workout Regimens" : "Giáo án & Nhận xét HLV"}
                      </span>
                      <span className={styles.quickActionDesc}>
                        {language === "en" ? "Targeted routines & coach notes" : "Lộ trình tập luyện cá nhân hóa"}
                      </span>
                    </div>
                  </div>
                  <span className={styles.quickActionArrow} aria-hidden="true">→</span>
                </Link>
                <Link href="/member/profile" className={styles.quickActionItem}>
                  <div className={styles.quickActionLeft}>
                    <div className={styles.quickActionThumbBox} aria-hidden="true">
                      <Image
                        src="/sporthub/activity-stretch.webp"
                        alt=""
                        fill
                        loading="eager"
                        unoptimized
                        className={styles.quickActionThumb}
                        sizes="46px"
                      />
                    </div>
                    <div className={styles.quickActionInfo}>
                      <span className={styles.quickActionLabel}>
                        {language === "en" ? "Fitness Profile & BMI" : "Hồ sơ thể lực & BMI"}
                      </span>
                      <span className={styles.quickActionDesc}>
                        {language === "en" ? "Track biometric health milestones" : "Theo dõi chỉ số cơ thể & mục tiêu"}
                      </span>
                    </div>
                  </div>
                  <span className={styles.quickActionArrow} aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* ---------- QR Check-in Modal ---------- */}
        {showQrModal && (
          <div
            className={styles.modalBackdrop}
            onClick={() => setShowQrModal(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
          >
            <div
              className={styles.modalBox}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setShowQrModal(false)}
                aria-label={language === "en" ? "Close dialog" : "Đóng cửa sổ"}
              >
                <IconClose size={18} />
              </button>

              <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }} aria-hidden="true">
                <StickerGatePass size={64} />
              </div>
              <h3
                id="qr-modal-title"
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  color: "var(--brand-900)",
                }}
              >
                {language === "en" ? "Member Check-in Pass" : "Mã Check-in Hội viên"}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: "var(--ink-500)",
                }}
              >
                {language === "en"
                  ? "Present this QR code before the turnstile camera or reception scanner to check in."
                  : "Đưa mã này trước camera ở cửa ra vào hoặc quầy lễ tân để tự động điểm danh vào trung tâm."}
              </p>

              {qrCodeUrl ? (
                <>
                  <div className={styles.turnstileReadyBadge}>
                    <span className={styles.pulseDot} aria-hidden="true" />
                    <span>
                      {language === "en"
                        ? "Turnstile Ready · Present to Scanner"
                        : "Sẵn sàng qua cổng · Đưa vào mắt đọc"}
                    </span>
                  </div>

                  <div className={styles.qrCodeContainer}>
                    <div className={styles.scannerLine} aria-hidden="true" />
                    <Image
                      src={qrCodeUrl}
                      alt={language === "en" ? "Check-in QR code" : "Mã QR Check-in"}
                      width={220}
                      height={220}
                      unoptimized
                      data-testid="member-qr"
                    />
                  </div>

                  <div className={styles.qrMetaRow}>
                    <span className={styles.timerBadge}>
                      <span className={styles.pulseDot} aria-hidden="true" />
                      {language === "en" ? `Refreshes in: ${qrSeconds}s` : `Làm mới sau: ${qrSeconds}s`}
                    </span>
                    <button
                      type="button"
                      className={styles.refreshBtn}
                      onClick={generateQr}
                      aria-label={language === "en" ? "Refresh QR code" : "Làm mới mã QR"}
                      data-testid="refresh-qr-btn"
                    >
                      <IconRefresh size={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                      {language === "en" ? "Refresh" : "Làm mới"}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: "40px 0" }}>
                  {language === "en" ? "Generating QR code..." : "Đang tạo mã QR..."}
                </div>
              )}

              <div
                style={{
                  fontSize: "0.85rem",
                  color: "var(--ink-700)",
                  fontWeight: 600,
                }}
              >
                {user?.fullName} · SportHub Member
              </div>
            </div>
          </div>
        )}
      </div>
    </MemberShell>
  );
}
