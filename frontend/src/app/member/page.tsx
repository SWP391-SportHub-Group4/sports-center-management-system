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
  IconBell,
  IconInvoice,
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
  PtEntitlementDto,
  InvoiceSummaryDto,
  Paged,
} from "@/lib/types";
import { walletApi } from "@/features/wallet/api";
import { WalletBalance } from "@/features/wallet/wallet-balance";
import { memberSchedule, type MemberEvent } from "@/features/member/api";
import {
  notificationsApi,
  memberNotificationHref,
} from "@/features/member/notifications-api";
import styles from "./dashboard.module.css";

function sessionHref(session: MemberEvent) {
  if (session.type === "COURT_RENTAL") return `/member/rentals/${session.id}`;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(session.startAtUtc));
  return `/member/schedule?date=${date}`;
}

function vietnamDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

/** Môn của buổi: lớp có sportName; PT thuộc Gym nên dùng nhãn Gym. */
function sportOf(session: MemberEvent, gymLabel: string) {
  return (
    session.sportName?.trim() ||
    (session.type === "PT_SESSION" ? gymLabel : null)
  );
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
  if (/gym|fitness|\bpt\b/.test(key)) return "gym";
  if (/cau long|badminton/.test(key)) return "badminton";
  if (/bong ro|basketball/.test(key)) return "basketball";
  return "other";
}

/** Loại buổi: lớp nhóm, PT hay thuê sân (khác với môn thể thao). */
function kindLabel(
  session: MemberEvent,
  l: { kindClass: string; kindPt: string; kindRental: string },
) {
  return session.type === "PT_SESSION"
    ? l.kindPt
    : session.type === "COURT_RENTAL"
      ? l.kindRental
      : l.kindClass;
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
  pt,
  thresholds,
  now,
  today,
  loadState,
}: {
  invoices: InvoiceSummaryDto[];
  packages: MemberPackageDto[];
  pt: PtEntitlementDto[];
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
  const [due, ...rest] = owed;
  if (due) {
    const holdActive =
      !!due.checkoutExpiresAtUtc &&
      new Date(due.checkoutExpiresAtUtc).getTime() > now;
    const extra = rest.length
      ? l.moreUnpaid
          .replace("{n}", String(rest.length))
          .replace(
            "{amount}",
            formatMoney(rest.reduce((sum, i) => sum + i.outstanding, 0)),
          )
      : null;
    items.push({
      key: "invoice",
      text: `${due.invoiceNumber} · ${formatMoney(due.outstanding)}`,
      detail: [
        holdActive
          ? l.heldUntil.replace("{time}", formatTime(due.checkoutExpiresAtUtc))
          : l.issuedOn.replace("{date}", formatDate(due.issuedAt)),
        extra,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/member/invoices/${due.invoiceId}`,
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
      href: `/member/threshold-responses/${th.responseId}`,
      action: l.respond,
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
      href: "/member/discover?tab=gym",
      action: l.renew,
    });
  }

  const ptNow = pt.find((p) => p.status === "ACTIVE");
  if (ptNow && ptNow.remainingQuota <= 1) {
    items.push({
      key: "pt",
      text: l.ptLow.replace("{n}", String(ptNow.remainingQuota)),
      href: "/member/discover?tab=pt",
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
  const pt = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", {
        signal,
      }),
    [],
  );
  const wallet = useApi((signal) => walletApi.balance(signal), []);
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
        query: { page: 1, pageSize: 3 },
      }),
    [],
  );
  const notifications = useApi(
    (signal) => notificationsApi.list(true, signal),
    [],
  );
  const invoices = useApi(
    (signal) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/members/me/invoices", {
        signal,
        query: { page: 1, pageSize: 5, status: "ISSUED" },
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
          pt={pt.data ?? []}
          thresholds={Array.isArray(thresholds.data) ? thresholds.data : []}
          now={now}
          today={date}
          loadState={
            [invoices, packages, pt, thresholds].some((state) => state.error)
              ? "error"
              : [invoices, packages, pt, thresholds].some(
                    (state) => state.loading || !state.data,
                  )
                ? "loading"
                : "ready"
          }
        />
        <div className={styles.primaryGrid}>
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
                      sports.data?.find((s) => s.sportId === r.sportId)?.name ??
                      null,
                  }));
                const rows = [...classRows, ...rentalRows].sort((a, b) =>
                  a.startAtUtc.localeCompare(b.startAtUtc),
                );
                const todayRows = rows.filter(
                  (s) => vietnamDate(s.startAtUtc) === date,
                );
                const upcoming = rows.filter(
                  (s) =>
                    new Date(s.endAtUtc).getTime() > now &&
                    vietnamDate(s.startAtUtc) > date &&
                    !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(
                      s.status ?? "",
                    ),
                );
                const next = upcoming[0];
                const countdown = next ? startsInLabel(next, now, l) : null;
                return (
                  <>
                    <div className={styles.todayAgenda}>
                      <h3>{l.todayTitle}</h3>
                      {todayRows.length ? (
                        <ul>
                          {todayRows.map((session) => (
                            <li key={session.id}>
                              <Link href={sessionHref(session)}>
                                <strong>
                                  {formatTime(session.startAtUtc)}–
                                  {formatTime(session.endAtUtc)}
                                </strong>
                                <span>{session.title}</span>
                                {session.roomName && (
                                  <small>{session.roomName}</small>
                                )}
                                <ExceptionChip value={session.status} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>{l.todayEmpty}</p>
                      )}
                    </div>
                    {next ? (
                      <>
                        <h3 className={styles.nextHeading}>
                          {t.memberPages.nextSession}
                        </h3>
                        <div
                          className={styles.nextSession}
                          data-surface="inverse"
                          data-sport={sportTone(sportOf(next, l.sportGym))}
                        >
                          <div className={styles.nextTop}>
                            <span className={styles.activity}>
                              {sportOf(next, l.sportGym) ??
                                (next.type === "PT_SESSION"
                                  ? t.memberPages.pt
                                  : t.refactor.courses)}
                            </span>
                            <span className={styles.kind}>
                              {kindLabel(next, l)}
                            </span>
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
                                  <IconLocation size={18} aria-hidden="true" />
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
                                const sport = sportOf(s, l.sportGym);
                                return (
                                  <li key={s.id} data-sport={sportTone(sport)}>
                                    <DateTile value={s.startAtUtc} />
                                    <div>
                                      <Link href={sessionHref(s)}>
                                        {s.title}
                                      </Link>
                                      <p>
                                        {sport && (
                                          <span className={styles.agendaSport}>
                                            {sport}
                                          </span>
                                        )}
                                        <span className={styles.agendaKind}>
                                          {kindLabel(s, l)}
                                        </span>
                                        {formatTime(s.startAtUtc)} –{" "}
                                        {formatTime(s.endAtUtc)}
                                        {(s.roomName ||
                                          s.type !== "COURT_RENTAL") &&
                                          ` · ${s.roomName || l.notAssigned}`}
                                      </p>
                                    </div>
                                    <ExceptionChip value={s.status} />
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : !todayRows.length ? (
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
                            href="/member/discover"
                          >
                            {l.exploreCourses}
                          </Link>
                          <Link
                            className={buttonClass({ variant: "secondary" })}
                            href="/member/discover?tab=gym"
                          >
                            {l.gymPtServices}
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </>
                );
              }}
            </AsyncSection>
          </section>

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
                        {(() => {
                          const open = pagedItems(gymVisit.data).find(
                            (v) => !v.checkOutTime,
                          );
                          return open ? (
                            <p className={styles.statusLine} role="status">
                              {l.insideGym.replace(
                                "{time}",
                                formatTime(open.checkInTime),
                              )}
                            </p>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <>
                        <p>{l.emptyGym}</p>
                        <p className={styles.caption}>{l.emptyGymHint}</p>
                        <Link
                          className={buttonClass({ size: "sm" })}
                          href="/member/discover?tab=gym"
                        >
                          {l.chooseMembership}
                        </Link>
                      </>
                    );
                  }}
                </AsyncSection>
              </section>
              <section
                className={styles.benefitSection}
                aria-labelledby="pt-title"
              >
                <h3 id="pt-title">{t.memberPages.pt}</h3>
                <AsyncSection state={pt}>
                  {(rows) => {
                    const current = [...rows].sort(
                      (a, b) =>
                        Number(b.status === "ACTIVE") -
                          Number(a.status === "ACTIVE") ||
                        b.validityEndDate.localeCompare(a.validityEndDate),
                    )[0];
                    return current ? (
                      <>
                        <div className={styles.inlineHeading}>
                          <strong>{current.coachName}</strong>
                          <ExceptionChip value={current.status} />
                        </div>
                        <p className={styles.quota}>
                          <strong>
                            {current.remainingQuota}
                            <span> / {current.totalQuota}</span>
                          </strong>
                          <span>{l.ptQuota}</span>
                        </p>
                        <p className={styles.caption}>
                          {t.memberPages.held}: {current.reservedSessions} ·{" "}
                          {t.memberPages.used}: {current.consumedSessions}
                        </p>
                      </>
                    ) : (
                      <p>{l.emptyPt}</p>
                    );
                  }}
                </AsyncSection>
                {(pt.data ?? []).some(
                  (p) => p.status === "ACTIVE" && p.remainingQuota > 0,
                ) && (
                  <Link
                    className={buttonClass({ size: "sm" })}
                    href="/member/pt/book"
                  >
                    {t.ptBook.bookCta}
                  </Link>
                )}
              </section>
            </section>

            <section className={styles.money} aria-labelledby="money-title">
              <div className={styles.sectionHeading}>
                <h2 id="money-title">{l.money}</h2>
                <IconInvoice size={22} aria-hidden="true" />
              </div>
              <AsyncSection state={invoices}>
                {(data) =>
                  pagedItems(data).some((i) => i.outstanding > 0) ? null : (
                    <div className={styles.quietEmpty}>
                      <strong>{l.noPayments}</strong>
                    </div>
                  )
                }
              </AsyncSection>
              <div className={styles.wallet}>
                <h3>{t.wallet.title}</h3>
                <AsyncSection state={wallet}>
                  {(balance) => <WalletBalance balance={balance} compact />}
                </AsyncSection>
              </div>
            </section>
          </div>
        </div>

        <div className={styles.secondaryGrid}>
          <section className={styles.feed} aria-labelledby="updates-title">
            <div className={styles.sectionHeading}>
              <h2 id="updates-title">{l.notifications}</h2>
              <IconBell size={22} aria-hidden="true" />
            </div>
            <AsyncSection state={notifications}>
              {(rows) =>
                rows.length ? (
                  <ul className={styles.feedList}>
                    {rows.slice(0, 3).map((n) => (
                      <li key={n.notificationId}>
                        <Link
                          href={memberNotificationHref(n) ?? "/notifications"}
                        >
                          <p>{n.message}</p>
                          <time>{formatDateTime(n.sentAt)}</time>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.quietEmpty}>
                    <strong>{l.noUpdates}</strong>
                    <p>{l.noUpdatesHint}</p>
                  </div>
                )
              }
            </AsyncSection>
          </section>
        </div>
      </div>
    </MemberShell>
  );
}
