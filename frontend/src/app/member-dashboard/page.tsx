"use client";

import { useState, useEffect, useCallback } from "react";
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
import styles from "./member-dashboard.module.css";

const ACTIVITIES = [
  {
    name: "Yoga",
    short: "Tìm lại nhịp thở",
    shortEn: "Find your breath",
    desc: "Cải thiện độ dẻo dai, nhịp thở và sự bình an trong tâm trí.",
    descEn: "Build body awareness, mobility, and steady breathing rhythm.",
    image: "/sporthub/activity-yoga-hd.webp",
    href: "/member-dashboard/class-schedule",
  },
  {
    name: "Fitness",
    short: "Bứt phá sức mạnh",
    shortEn: "Build your strength",
    desc: "Xây dựng cơ bắp, sức bền và nâng cao thể lực toàn diện.",
    descEn: "Develop strength, endurance, and progressive training.",
    image: "/sporthub/activity-fitness-hd.webp",
    href: "/member-dashboard/class-schedule",
  },
  {
    name: "GroupX",
    short: "Cháy cùng âm nhạc",
    shortEn: "Move together",
    desc: "Lớp học sôi động theo nhóm tràn đầy năng lượng cùng HLV.",
    descEn: "Train to music in an energetic group class led by coaches.",
    image: "/sporthub/activity-groupx-hd.webp",
    href: "/member-dashboard/class-schedule",
  },
  {
    name: "Mobility & Recovery",
    short: "Giãn cơ & Phục hồi",
    shortEn: "Recover to go further",
    desc: "Giúp cơ bắp thả lỏng, hồi phục nhanh và phòng ngừa chấn thương.",
    descEn: "Improve mobility and recovery with guided movement.",
    image: "/sporthub/activity-stretch-hd.webp",
    href: "/member-dashboard/class-schedule",
  },
];

export default function MemberDashboardPage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
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
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(""));
    setQrSeconds(60);
  }, [user]);

  const handleOpenQr = () => {
    generateQr();
    setShowQrModal(true);
  };

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
  }, [showQrModal, generateQr]);

  const usable = (packages.data ?? []).filter((p) => p.isUsable);
  const remaining = usable.reduce(
    (acc, p) => acc + (p.remainingSessions ?? 0),
    0,
  );
  const hasUnlimited = usable.some((p) => p.remainingSessions === null);

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
          <div className={styles.heroContent}>
            <p className={styles.heroTag}>
              {t.memberDashboard.heroTag}
            </p>
            <h1 id="welcome-title" className={styles.heroTitle}>
              {getGreeting()}, {user?.fullName ?? (language === "en" ? "there" : "bạn")}!
            </h1>
            <p className={styles.heroSubtitle}>
              {language === "en"
                ? "Ready for today's session? Maintain a consistent training rhythm to achieve your health and fitness goals."
                : "Sẵn sàng cho buổi tập hôm nay? Hãy duy trì nhịp độ rèn luyện đều đặn để đạt được mục tiêu sức khỏe và thể lực của bạn."}
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
                    ? (language === "en" ? "Active Member" : "Hội viên đang hoạt động")
                    : (language === "en" ? "Member Account" : "Tài khoản thành viên")}
                </span>
                <span className={styles.passName}>
                  {user?.fullName ?? "Member"}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={styles.qrButton}
              onClick={handleOpenQr}
              aria-label={language === "en" ? "Open Check-in QR" : "Mở mã QR Check-in"}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>{language === "en" ? "QR Check-in" : "Mã QR Check-in"}</span>
            </button>
          </div>
        </section>

        {/* ---------- Quick Stats ---------- */}
        <section className={styles.statGrid} aria-label={language === "en" ? "Overview Statistics" : "Thống kê tổng quan"}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Upcoming Sessions" : "Buổi tập sắp tới"}
            </span>
            <span className={styles.statNumber}>
              {upcoming.data?.length ?? 0}
            </span>
            <span className={styles.statDesc}>
              {nextSession
                ? (language === "en"
                    ? `Next: ${formatDate(nextSession.session.startAtUtc)}`
                    : `Lớp gần nhất: ${formatDate(nextSession.session.startAtUtc)}`)
                : (language === "en" ? "No bookings yet" : "Chưa có lịch đăng ký")}
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Available Sessions" : "Số buổi khả dụng"}
            </span>
            <span className={styles.statNumber}>
              {hasUnlimited ? `${remaining}+` : remaining}
            </span>
            <span className={styles.statDesc}>
              {hasUnlimited
                ? (language === "en" ? "Includes unlimited pass" : "Bao gồm gói không giới hạn")
                : (language === "en" ? "Total across active passes" : "Tổng các gói còn hiệu lực")}
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Active Packages" : "Gói tập hoạt động"}
            </span>
            <span className={styles.statNumber}>{usable.length}</span>
            <span className={styles.statDesc}>
              {usable.length > 0
                ? usable
                    .map((p) => p.packageName)
                    .slice(0, 2)
                    .join(", ")
                : (language === "en" ? "No active pass" : "Chưa kích hoạt gói")}
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              {language === "en" ? "Outstanding Balance" : "Phí cần thanh toán"}
            </span>
            <span className={styles.statNumber}>
              {formatMoney(outstanding)}
            </span>
            <span className={styles.statDesc}>
              {outstanding > 0
                ? (language === "en" ? "Awaiting counter payment" : "Hóa đơn chờ tại quầy")
                : (language === "en" ? "All settled" : "Tất cả đã thanh toán")}
            </span>
          </div>
        </section>

        {/* ---------- Next Workout Spotlight ---------- */}
        <section aria-labelledby="next-workout-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="next-workout-title" className={styles.sectionTitle}>
                {language === "en" ? "Your Next Workout Session" : "Buổi tập tiếp theo của bạn"}
              </h2>
              <p className={styles.sectionSubtitle}>
                {language === "en"
                  ? "Get ready and arrive 5-10 minutes before class start!"
                  : "Chuẩn bị sẵn sàng và đến sớm 5-10 phút trước giờ học nhé!"}
              </p>
            </div>
            <Link
              className={styles.sectionLink}
              href="/member-dashboard/class-schedule"
            >
              <span>{language === "en" ? "View full schedule" : "Xem lịch toàn bộ lớp"}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {upcoming.data && upcoming.data.length === 0 ? (
            <div className={styles.emptySpotlight}>
              <div className={styles.emptySpotlightIcon}>🎯</div>
              <h3 className={styles.emptySpotlightTitle}>
                {language === "en" ? "You have no classes scheduled today" : "Hôm nay bạn chưa có lịch tập nào"}
              </h3>
              <p className={styles.emptySpotlightText}>
                {language === "en"
                  ? "Maintain a rhythm of 3-4 workouts per week for peak fitness. Explore Yoga, Fitness, and GroupX classes available today!"
                  : "Duy trì nhịp độ rèn luyện 3–4 buổi mỗi tuần để đạt hiệu quả thể lực tối đa. Khám phá các lớp Yoga, Fitness hoặc GroupX diễn ra hôm nay!"}
              </p>
              <Link
                href="/member-dashboard/class-schedule"
                className="btn btn--primary btn--sm"
              >
                <span>{language === "en" ? "Browse Schedule & Book Spot" : "Xem lịch lớp & Đặt chỗ ngay"}</span>
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

                return (
                  <div className={styles.spotlightCard}>
                    <div className={styles.spotlightHeader}>
                      <span className={styles.disciplineBadge}>
                        🏋️ {current.session.discipline || (language === "en" ? "Group Class" : "Lớp nhóm")}
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
                            🕒 {formatDateTime(current.session.startAtUtc)}
                          </span>
                          <span className={styles.metaItem}>
                            📍 {current.session.roomName}
                          </span>
                          <span className={styles.metaItem}>
                            👤 {language === "en" ? `Coach ${current.session.coachName}` : `HLV ${current.session.coachName}`}
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
                          {language === "en" ? "📅 Add to Calendar" : "📅 Lưu vào lịch"}
                        </button>
                        <Link
                          href="/member-dashboard/my-registrations"
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

        {/* ---------- Explore Activities (Like Homepage) ---------- */}
        <section aria-labelledby="activities-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="activities-title" className={styles.sectionTitle}>
                {language === "en" ? "Explore Sports & Disciplines" : "Khám phá các bộ môn thể thao"}
              </h2>
              <p className={styles.sectionSubtitle}>
                {language === "en"
                  ? "Choose the activity that matches your energy, preference, and fitness goals"
                  : "Chọn bộ môn phù hợp với năng lượng, sở thích và mục tiêu thể lực của bạn"}
              </p>
            </div>
            <Link
              className={styles.sectionLink}
              href="/member-dashboard/class-schedule"
            >
              <span>{language === "en" ? "Book a Class" : "Đặt lịch ngay"}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className={styles.activityGrid}>
            {ACTIVITIES.map((act) => (
              <Link
                href={act.href}
                key={act.name}
                className={styles.activityCard}
              >
                <Image
                  src={act.image}
                  alt={act.name}
                  className={styles.activityImage}
                  fill
                  sizes="(max-width: 768px) 100vw, 25vw"
                />
                <div className={styles.activityOverlay} />
                <div className={styles.activityContent}>
                  <span className={styles.activityTag}>
                    {language === "en" ? act.shortEn : act.short}
                  </span>
                  <h3 className={styles.activityTitle}>{act.name}</h3>
                  <p className={styles.activityDesc}>
                    {language === "en" ? act.descEn : act.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- Packages & Invoices Row ---------- */}
        <div className={styles.twoColGrid}>
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
                href="/member-dashboard/my-plans"
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

          {/* Billing & Invoices summary */}
          <section aria-labelledby="billing-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="billing-title" className={styles.sectionTitle}>
                  {language === "en" ? "Invoices & Payments" : "Hóa đơn & Thanh toán"}
                </h2>
                <p className={styles.sectionSubtitle}>
                  {language === "en" ? "Transactions and desk fees" : "Giao dịch và các khoản thu tại quầy"}
                </p>
              </div>
              <Link
                className={styles.sectionLink}
                href="/member-dashboard/invoices"
              >
                <span>{language === "en" ? "View All" : "Xem tất cả"}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className={styles.billingCard}>
              <div className={styles.billingHeader}>
                <div>
                  <span className={styles.sectionSubtitle}>
                    {language === "en" ? "Outstanding balance" : "Số dư cần thanh toán"}
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
                  fontSize: "0.88rem",
                  color: "var(--ink-500)",
                  lineHeight: 1.5,
                }}
              >
                {outstanding > 0
                  ? (language === "en"
                      ? "You have pending invoices. Please settle directly at the SportHub reception desk."
                      : "Bạn có hóa đơn chưa thanh toán. Vui lòng thanh toán trực tiếp tại quầy lễ tân SportHub.")
                  : (language === "en"
                      ? "All your service invoices are fully settled. Thank you!"
                      : "Tất cả hóa đơn dịch vụ của bạn đã được thanh toán đầy đủ. Cảm ơn bạn!")}
              </p>

              <div>
                <Link
                  href="/member-dashboard/invoices"
                  className="btn btn--secondary btn--sm"
                  style={{ width: "100%", textAlign: "center" }}
                >
                  {language === "en" ? "Look up invoice details" : "Tra cứu chi tiết hóa đơn"}
                </Link>
              </div>
            </div>
          </section>
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
                ✕
              </button>

              <div style={{ fontSize: "1.8rem" }}>🎫</div>
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
                  <div className={styles.qrCodeContainer}>
                    <Image
                      src={qrCodeUrl}
                      alt={language === "en" ? "Check-in QR code" : "Mã QR Check-in"}
                      width={220}
                      height={220}
                      unoptimized
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
                      aria-label={language === "en" ? "Regenerate new QR code immediately" : "Tạo lại mã QR mới ngay lập tức"}
                    >
                      {language === "en" ? "🔄 Refresh" : "🔄 Làm mới"}
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
