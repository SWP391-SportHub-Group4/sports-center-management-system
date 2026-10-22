"use client";

import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { AsyncSection, StatusChip } from "@/components/ui";
import { buttonClass } from "@/components/primitives";
import {
  IconCalendar,
  IconClock,
  IconLocation,
  IconDumbbell,
  IconAlert,
} from "@/components/icons";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatMoney,
  todayIso,
} from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { rentalApi } from "@/features/rentals/api";
import type {
  GymCheckInDto,
  ThresholdResponseDto,
  SportDto,
  MemberPackageDto,
  InvoiceSummaryDto,
  Paged,
} from "@/lib/types";
import { memberSchedule, type MemberEvent } from "@/features/member/api";
import {
  FitnessQuickCard,
  RecommendedSection,
  TrainingSummaryCard,
} from "@/features/member/overview-widgets";
import styles from "./dashboard.module.css";

function sessionHref(session: MemberEvent) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(session.startAtUtc));
  return `/member/schedule?date=${date}${session.type === "COURT_RENTAL" ? `&rental=${encodeURIComponent(session.id)}` : ""}`;
}

function vietnamDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

/** Môn của buổi: chỉ lớp có sportName. */
function sportOf(session: MemberEvent) {
  return session.sportName?.trim() || null;
}

/** Nhãn đếm ngược chỉ khi buổi diễn ra trong 24 giờ tới; xa hơn thì ô ngày đã đủ. */
function startsInLabel(
  session: MemberEvent,
  now: number,
  l: {
    inProgress: string;
    startsInMin: string;
    startsInHourMin: string;
  },
) {
  const start = new Date(session.startAtUtc).getTime();
  if (start <= now) return l.inProgress;
  const minutes = Math.ceil((start - now) / 60_000);
  if (minutes >= 24 * 60) return null;
  if (minutes < 60) return l.startsInMin.replace("{n}", String(minutes));
  return l.startsInHourMin
    .replace("{h}", String(Math.floor(minutes / 60)))
    .replace("{m}", String(minutes % 60));
}

/**
 * Nhóm màu theo tên môn. Môn là dữ liệu cấu hình nên mọi tên lạ rơi về "other"
 * (màu nhấn mặc định); màu luôn đi kèm nhãn chữ.
 */
function sportTone(label: string | null) {
  const key = (label ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
  if (/gym|fitness/.test(key)) return "gym";
  if (/cau long|badminton/.test(key)) return "badminton";
  if (/bong ro|basketball/.test(key)) return "basketball";
  return "other";
}

/** Loại buổi: lớp nhóm hay thuê sân (khác với môn thể thao). */
function kindLabel(
  session: MemberEvent,
  l: { kindClass: string; kindRental: string },
) {
  return session.type === "COURT_RENTAL" ? l.kindRental : l.kindClass;
}

function KindTag({ session }: { session: MemberEvent }) {
  const { t } = useLanguage();
  const kind = session.type === "COURT_RENTAL" ? "rental" : "class";
  return (
    <span className={styles.kindTag} data-kind={kind}>
      {kindLabel(session, t.memberDashboardV2)}
    </span>
  );
}

function CheckInTag({ session, now }: { session: MemberEvent; now: number }) {
  const { t } = useLanguage();
  const l = t.memberDashboardV2;
  const attendance = session.attendanceStatus?.toUpperCase();
  const state =
    attendance === "PRESENT"
      ? "present"
      : attendance === "ABSENT"
        ? "absent"
        : new Date(session.startAtUtc).getTime() > now
          ? "upcoming"
          : "pending";
  const label =
    state === "present"
      ? l.checkinPresent
      : state === "absent"
        ? l.checkinAbsent
        : state === "upcoming"
          ? l.checkinUpcoming
          : l.checkinPending;
  return (
    <span className={styles.checkInTag} data-state={state}>
      {label}
    </span>
  );
}

function responseTime(deadlineUtc: string, now: number) {
  const minutes = Math.max(
    1,
    Math.ceil((new Date(deadlineUtc).getTime() - now) / 60_000),
  );
  if (minutes >= 1440)
    return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** Trạng thái bình thường thì không cần chip; chỉ hiện chip khi có gì cần chú ý. */
const ROUTINE_STATUS = new Set(["scheduled", "confirmed", "active"]);

function ExceptionChip({ value }: { value?: string | null }) {
  if (!value || ROUTINE_STATUS.has(value.replace(/_/g, "").toLowerCase())) {
    return null;
  }
  return <StatusChip value={value} />;
}

function DateTile({ value }: { value: string }) {
  const { language } = useLanguage();
  const date = new Date(value);
  const options = { timeZone: "Asia/Ho_Chi_Minh" };
  return (
    <time className={styles.dateTile} dateTime={value}>
      <span>
        {new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
          ...options,
          month: "short",
        }).format(date)}
      </span>
      <strong>
        {new Intl.DateTimeFormat("en-GB", {
          ...options,
          day: "2-digit",
        }).format(date)}
      </strong>
      <span>
        {new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-GB", {
          ...options,
          weekday: "short",
        }).format(date)}
      </span>
    </time>
  );
}

/** Việc cần làm ngay, xếp theo độ gấp; không có việc nào thì không hiện gì. */
function AttentionList({
  invoices,
  packages,
  thresholds,
  now,
  today,
  loadState,
}: {
  invoices: InvoiceSummaryDto[];
  packages: MemberPackageDto[];
  thresholds: ThresholdResponseDto[];
  now: number;
  today: string;
  loadState: "loading" | "error" | "ready";
}) {
  const { t } = useLanguage();
  const l = t.memberDashboardV2;
  const daysUntil = (iso: string) =>
    Math.round(
      (Date.parse(`${iso}T00:00:00+07:00`) -
        Date.parse(`${today}T00:00:00+07:00`)) /
        86_400_000,
    );
  const items: {
    key: string;
    text: string;
    detail?: string;
    deadline?: string;
    href: string;
    action: string;
  }[] = [];

  // Hóa đơn gấp nhất trước: hạn giữ chỗ gần nhất, sau đó phát hành lâu nhất.
  const owed = invoices
    .filter((i) => i.outstanding > 0)
    .sort(
      (x, y) =>
        (x.checkoutExpiresAtUtc ?? "9").localeCompare(
          y.checkoutExpiresAtUtc ?? "9",
        ) || x.issuedAt.localeCompare(y.issuedAt),
    );
  for (const due of owed) {
    const holdActive =
      !!due.checkoutExpiresAtUtc &&
      new Date(due.checkoutExpiresAtUtc).getTime() > now;
    items.push({
      key: `invoice-${due.invoiceId}`,
      text: `${due.invoiceNumber} · ${due.itemDescription || "Service"} · ${formatMoney(due.outstanding)}`,
      detail: [
        holdActive
          ? l.heldUntil.replace("{time}", formatTime(due.checkoutExpiresAtUtc))
          : l.issuedOn.replace("{date}", formatDate(due.issuedAt)),
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/checkout/${due.invoiceId}`,
      action: l.payNow,
    });
  }

  // Lớp dưới ngưỡng đang chờ Member chọn phương án (A16): việc có hạn nên đứng trước các nhắc nhở khác.
  for (const th of thresholds
    .filter(
      (x) =>
        x.choice === null &&
        new Date(x.deadlineUtc).getTime() > now &&
        !/RESOLVED|COMPLETED|CANCELLED/i.test(x.resolutionStatus ?? ""),
    )
    .sort((a, b) => a.deadlineUtc.localeCompare(b.deadlineUtc))) {
    items.push({
      key: `threshold-${th.responseId}`,
      text: l.thresholdDue
        .replace("{name}", th.className)
        .replace("{date}", formatDateTime(th.deadlineUtc)),
      deadline: l.responseDueIn.replace(
        "{time}",
        responseTime(th.deadlineUtc, now),
      ),
      href: `/member/services?section=courses&view=owned&responseId=${th.responseId}`,
      action: l.transferOrRefund,
    });
  }

  const gym = [...packages].sort(
    (a, b) =>
      Number(b.isUsable) - Number(a.isUsable) ||
      b.endDate.localeCompare(a.endDate),
  )[0];
  if (gym?.isUsable && daysUntil(gym.endDate) <= 7) {
    items.push({
      key: "gym",
      text: l.gymEnds.replace("{date}", formatDate(gym.endDate)),
      href: "/member/services?section=gym&view=explore",
      action: l.renew,
    });
  }

  if (!items.length)
    return (
      <section
        className={`${styles.attention} ${styles.attentionClear}`}
        aria-labelledby="attention-title"
      >
        <h2 id="attention-title">{l.attentionTitle}</h2>
        <p>
          {loadState === "error"
            ? l.attentionUnavailable
            : loadState === "loading"
              ? l.checkingAttention
              : l.noAttention}
        </p>
      </section>
    );
  return (
    <section className={styles.attention} aria-labelledby="attention-title">
      <h2 id="attention-title">
        <IconAlert size={20} aria-hidden="true" />
        {l.attentionTitle}
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <div>
              <strong>{item.text}</strong>
              {item.detail && <span>{item.detail}</span>}
              {item.deadline && (
                <span className={styles.deadline} aria-live="polite">
                  {item.deadline}
                </span>
              )}
            </div>
            <Link
              href={item.href}
              className={buttonClass({ size: "sm" })}
              aria-label={`${item.action}: ${item.text}`}
            >
              {item.action}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function MemberDashboardPage() {
  const { t, language } = useLanguage();
  const l = t.memberDashboardV2;
  const { user } = useAuth();
  const now = useNow();
  const date = todayIso();
  const schedule = useApi((signal) => memberSchedule(date, 30, signal), [date]);
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );
  const thresholds = useApi(
    (signal) =>
      api.get<ThresholdResponseDto[]>("/api/class-threshold-responses/mine", {
        signal,
      }),
    [],
  );
  const gymVisit = useApi(
    (signal) =>
      api.get<Paged<GymCheckInDto>>("/api/members/me/gym-checkins", {
        signal,
        query: { page: 1, pageSize: 20 },
      }),
    [],
  );
  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal,
        query: { page: 1, pageSize: 100, status: "ISSUED" },
      }),
    [],
  );
  const rentals = useApi(
    (signal) =>
      rentalApi.mine(
        new Date().toISOString(),
        new Date(Date.now() + 30 * 86_400_000).toISOString(),
        signal,
      ),
    [],
  );
  const sports = useApi(
    (signal) =>
      api.get<SportDto[]>("/api/sports", {
        anonymous: true,
        signal,
        query: { service: "COURT_RENTAL" },
      }),
    [],
  );
  // Sports the member already trains, used to rank recommended classes.
  const favoriteSports = [
    ...(schedule.data ?? []).map((s) => s.sportName ?? ""),
    ...(rentals.data ?? []).map(
      (r) => sports.data?.find((x) => x.sportId === r.sportId)?.name ?? "",
    ),
  ].filter(Boolean);
  const dateLabel = new Intl.DateTimeFormat(
    language === "vi" ? "vi-VN" : "en-GB",
    { dateStyle: "full", timeZone: "Asia/Ho_Chi_Minh" },
  ).format(new Date(`${date}T12:00:00+07:00`));

  return (
    <MemberShell
      title={user?.fullName ? `${l.hello}, ${user.fullName}` : l.title}
      description={dateLabel}
    >
      <div className={styles.dashboard}>
        <AttentionList
          invoices={invoices.data ? pagedItems(invoices.data) : []}
          packages={packages.data ?? []}
          thresholds={Array.isArray(thresholds.data) ? thresholds.data : []}
          now={now}
          today={date}
          loadState={
            [invoices, packages, thresholds].some((state) => state.error)
              ? "error"
              : [invoices, packages, thresholds].some(
                    (state) => state.loading || !state.data,
                  )
                ? "loading"
                : "ready"
          }
        />
        <nav className={styles.quickActions} aria-label={l.quickActions}>
          <strong>{l.quickActions}</strong>
          <Link href="/member/services?section=courts&view=explore">
            {l.quickCourt}
          </Link>
          <Link href="/member/services?section=courses&view=explore">
            {l.quickClass}
          </Link>
          <Link href="/member/services?section=gym&view=explore">
            {l.quickRenew}
          </Link>
        </nav>
        <div className={styles.primaryGrid}>
          <div className={styles.main}>
            <section
              className={styles.schedule}
              aria-labelledby="next-session-title"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <h2 id="next-session-title">{t.memberPages.schedule}</h2>
                </div>
                <IconCalendar size={24} aria-hidden="true" />
              </div>
              <AsyncSection state={schedule}>
                {(classRows) => {
                  // Thuê sân xác nhận cũng là lịch của Member: gộp vào cùng dòng thời gian.
                  const rentalRows: MemberEvent[] = (rentals.data ?? [])
                    .filter((r) => r.status === "CONFIRMED")
                    .map((r) => ({
                      id: r.courtRentalId,
                      title: t.memberPages.courtRental,
                      type: "COURT_RENTAL",
                      startAtUtc: r.startAtUtc,
                      endAtUtc: r.endAtUtc,
                      roomName: null,
                      status: null,
                      sportName:
                        sports.data?.find((s) => s.sportId === r.sportId)
                          ?.name ?? null,
                    }));
                  const rows = [...classRows, ...rentalRows].sort((a, b) =>
                    a.startAtUtc.localeCompare(b.startAtUtc),
                  );
                  const todayGym = pagedItems(gymVisit.data).filter(
                    (visit) => vietnamDate(visit.checkInTime) === date,
                  );
                  const upcoming = rows.filter(
                    (s) =>
                      new Date(s.startAtUtc).getTime() > now &&
                      !["CANCELLED", "COMPLETED"].includes(s.status ?? ""),
                  );
                  const next = upcoming[0];
                  const countdown = next ? startsInLabel(next, now, l) : null;
                  return (
                    <>
                      {next ? (
                        <>
                          <div
                            className={styles.nextSession}
                            data-surface="inverse"
                            data-sport={sportTone(sportOf(next))}
                          >
                            <div className={styles.nextTop}>
                              <span className={styles.activity}>
                                {sportOf(next) ?? t.refactor.courses}
                              </span>
                              <KindTag session={next} />
                              <CheckInTag session={next} now={now} />
                              <ExceptionChip value={next.status} />
                            </div>
                            {countdown && (
                              <p className={styles.startsIn}>{countdown}</p>
                            )}
                            <div className={styles.nextBody}>
                              <DateTile value={next.startAtUtc} />
                              <div className={styles.nextInfo}>
                                <h3>{next.title}</h3>
                                <p>
                                  <IconClock size={18} aria-hidden="true" />
                                  {formatTime(next.startAtUtc)} –{" "}
                                  {formatTime(next.endAtUtc)}
                                </p>
                                {(next.roomName ||
                                  next.type !== "COURT_RENTAL") && (
                                  <p>
                                    <IconLocation
                                      size={18}
                                      aria-hidden="true"
                                    />
                                    {next.roomName || l.notAssigned}
                                  </p>
                                )}
                                {next.coachName && <p>{next.coachName}</p>}
                                {next.isMakeup && <p>{t.memberPages.makeup}</p>}
                              </div>
                            </div>
                            <Link
                              href={sessionHref(next)}
                              className={buttonClass()}
                            >
                              {l.openSchedule}
                            </Link>
                          </div>
                          {upcoming.length > 1 && (
                            <div className={styles.upcoming}>
                              <h3>{l.upNext}</h3>
                              <ul className={styles.agenda}>
                                {upcoming.slice(1, 4).map((s) => {
                                  const sport = sportOf(s);
                                  return (
                                    <li
                                      key={s.id}
                                      data-sport={sportTone(sport)}
                                    >
                                      <DateTile value={s.startAtUtc} />
                                      <div>
                                        <Link href={sessionHref(s)}>
                                          {s.title}
                                        </Link>
                                        <p>
                                          {sport && (
                                            <span
                                              className={styles.agendaSport}
                                            >
                                              {sport}
                                            </span>
                                          )}
                                          <KindTag session={s} />
                                          {formatTime(s.startAtUtc)} –{" "}
                                          {formatTime(s.endAtUtc)}
                                          {(s.roomName ||
                                            s.type !== "COURT_RENTAL") &&
                                            ` · ${s.roomName || l.notAssigned}`}
                                        </p>
                                      </div>
                                      <CheckInTag session={s} now={now} />
                                      <ExceptionChip value={s.status} />
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          className={styles.emptySchedule}
                          data-surface="inverse"
                        >
                          <IconCalendar size={32} aria-hidden="true" />
                          <h3>{l.noScheduleTitle}</h3>
                          <p>{l.noScheduleBody}</p>
                          <div className={styles.emptyActions}>
                            <Link
                              className={buttonClass()}
                              href="/member/services"
                            >
                              {l.exploreCourses}
                            </Link>
                            <Link
                              className={buttonClass({ variant: "secondary" })}
                              href="/member/services?section=gym&view=explore"
                            >
                              {l.gymServices}
                            </Link>
                          </div>
                        </div>
                      )}
                      {todayGym.length > 0 && (
                        <div className={styles.todayAgenda}>
                          <h3>{l.gymWalkIn}</h3>
                          <ul>
                            {todayGym.map((visit) => (
                              <li key={visit.checkInId}>
                                <Link href="/member/services?section=gym&view=owned">
                                  <strong>
                                    {formatTime(visit.checkInTime)}
                                  </strong>
                                  <span>{l.gymWalkIn}</span>
                                  <span
                                    className={styles.checkInTag}
                                    data-state="present"
                                  >
                                    {l.checkinPresent}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  );
                }}
              </AsyncSection>
            </section>
            <RecommendedSection favoriteSports={favoriteSports} />
          </div>

          <div className={styles.rail}>
            <section
              className={styles.benefits}
              aria-labelledby="benefits-title"
            >
              <div className={styles.sectionHeading}>
                <h2 id="benefits-title">{l.benefits}</h2>
                <IconDumbbell size={24} aria-hidden="true" />
              </div>
              <section
                className={styles.benefitSection}
                aria-labelledby="gym-title"
              >
                <h3 id="gym-title">{t.memberPages.gym}</h3>
                <AsyncSection state={packages}>
                  {(rows) => {
                    const current = [...rows].sort(
                      (a, b) =>
                        Number(b.isUsable) - Number(a.isUsable) ||
                        b.endDate.localeCompare(a.endDate),
                    )[0];
                    return current ? (
                      <>
                        <div className={styles.inlineHeading}>
                          <strong>{current.packageName}</strong>
                          <ExceptionChip value={current.status} />
                        </div>
                        <p>
                          {formatDate(current.startDate)} –{" "}
                          {formatDate(current.endDate)}
                          {current.isUsable &&
                            ` · ${l.daysLeft.replace(
                              "{n}",
                              String(
                                Math.max(
                                  0,
                                  Math.round(
                                    (Date.parse(
                                      `${current.endDate}T00:00:00+07:00`,
                                    ) -
                                      Date.parse(`${date}T00:00:00+07:00`)) /
                                      86_400_000,
                                  ),
                                ),
                              ),
                            )}`}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>{l.emptyGym}</p>
                        <p className={styles.caption}>{l.emptyGymHint}</p>
                        <Link
                          className={buttonClass({ size: "sm" })}
                          href="/member/services?section=gym&view=explore"
                        >
                          {l.chooseMembership}
                        </Link>
                      </>
                    );
                  }}
                </AsyncSection>
              </section>
            </section>
            <TrainingSummaryCard />
            <FitnessQuickCard />
          </div>
        </div>
      </div>
    </MemberShell>
  );
}
