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
  IconSearch,
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
import type {
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
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(session.startAtUtc));
  return `/member/schedule?date=${date}`;
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
  const dateLabel = new Intl.DateTimeFormat(
    language === "vi" ? "vi-VN" : "en-GB",
    { dateStyle: "full", timeZone: "Asia/Ho_Chi_Minh" },
  ).format(new Date(`${date}T12:00:00+07:00`));

  return (
    <MemberShell
      title={user?.fullName ? `${l.hello}, ${user.fullName}` : l.title}
      description={dateLabel}
      actions={
        <Link
          className={buttonClass({ variant: "secondary" })}
          href="/member/discover"
        >
          <IconSearch size={18} aria-hidden="true" />
          {t.memberPages.discover}
        </Link>
      }
    >
      <div className={styles.dashboard}>
        <div className={styles.primaryGrid}>
          <section
            className={styles.schedule}
            aria-labelledby="next-session-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="next-session-title">{t.memberPages.nextSession}</h2>
                <p>{l.scheduleHint}</p>
              </div>
              <IconCalendar size={24} aria-hidden="true" />
            </div>
            <AsyncSection state={schedule}>
              {(rows) => {
                const upcoming = rows.filter(
                  (s) =>
                    new Date(s.endAtUtc).getTime() > now &&
                    !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(
                      s.status ?? "",
                    ),
                );
                const next = upcoming[0];
                const countdown = next ? startsInLabel(next, now, l) : null;
                return next ? (
                  <>
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
                          <p>
                            <IconLocation size={18} aria-hidden="true" />
                            {next.roomName || l.notAssigned}
                          </p>
                          {next.coachName && <p>{next.coachName}</p>}
                          {next.isMakeup && <p>{t.memberPages.makeup}</p>}
                        </div>
                      </div>
                      <Link href={sessionHref(next)} className={buttonClass()}>
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
                                  <Link href={sessionHref(s)}>{s.title}</Link>
                                  <p>
                                    {sport && (
                                      <span className={styles.agendaSport}>
                                        {sport}
                                      </span>
                                    )}
                                    {formatTime(s.startAtUtc)} –{" "}
                                    {formatTime(s.endAtUtc)} ·{" "}
                                    {s.roomName || l.notAssigned}
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
                ) : (
                  <div className={styles.emptySchedule}>
                    <IconCalendar size={40} aria-hidden="true" />
                    <h3>{l.noScheduleTitle}</h3>
                    <p>{l.noScheduleBody}</p>
                    <Link className={buttonClass()} href="/member/discover">
                      {t.memberPages.discover}
                    </Link>
                  </div>
                );
              }}
            </AsyncSection>
            <Link className={styles.sectionLink} href="/member/schedule">
              {l.moreSchedule}
            </Link>
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
                        </p>
                      </>
                    ) : (
                      <>
                        <p>{l.emptyGym}</p>
                        <p className={styles.caption}>{l.emptyGymHint}</p>
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
                <Link href="/member/services?tab=pt">{l.morePackages}</Link>
              </section>
              <Link className={styles.sectionLink} href="/member/services">
                {l.viewServices}
              </Link>
            </section>

            <section className={styles.money} aria-labelledby="money-title">
              <div className={styles.sectionHeading}>
                <h2 id="money-title">{l.money}</h2>
                <IconInvoice size={22} aria-hidden="true" />
              </div>
              <AsyncSection state={invoices}>
                {(data) => {
                  // Hóa đơn gấp nhất trước: hạn giữ chỗ gần nhất, sau đó phát hành lâu nhất.
                  const owed = pagedItems(data)
                    .filter((i) => i.outstanding > 0)
                    .sort(
                      (x, y) =>
                        (x.checkoutExpiresAtUtc ?? "9").localeCompare(
                          y.checkoutExpiresAtUtc ?? "9",
                        ) || x.issuedAt.localeCompare(y.issuedAt),
                    );
                  const [due, ...rest] = owed;
                  if (!due) {
                    return (
                      <div className={styles.quietEmpty}>
                        <strong>{l.noPayments}</strong>
                      </div>
                    );
                  }
                  const holdActive =
                    !!due.checkoutExpiresAtUtc &&
                    new Date(due.checkoutExpiresAtUtc).getTime() > now;
                  return (
                    <div className={styles.due} data-owed="true">
                      <div>
                        <span className={styles.dueNumber}>
                          {due.invoiceNumber} ·{" "}
                          {l.issuedOn.replace(
                            "{date}",
                            formatDate(due.issuedAt),
                          )}
                        </span>
                        <strong className={styles.dueAmount}>
                          {formatMoney(due.outstanding)}
                        </strong>
                        {holdActive && (
                          <span className={styles.dueHold}>
                            {l.heldUntil.replace(
                              "{time}",
                              formatTime(due.checkoutExpiresAtUtc),
                            )}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/member/invoices/${due.invoiceId}`}
                        className={buttonClass({ size: "sm" })}
                        aria-label={`${l.payNow}: ${due.invoiceNumber}`}
                      >
                        {l.payNow}
                      </Link>
                      {rest.length > 0 && (
                        <p className={styles.dueMore}>
                          {l.moreUnpaid
                            .replace("{n}", String(rest.length))
                            .replace(
                              "{amount}",
                              formatMoney(
                                rest.reduce((sum, i) => sum + i.outstanding, 0),
                              ),
                            )}
                        </p>
                      )}
                    </div>
                  );
                }}
              </AsyncSection>
              <div className={styles.wallet}>
                <h3>{t.wallet.title}</h3>
                <AsyncSection state={wallet}>
                  {(balance) => <WalletBalance balance={balance} compact />}
                </AsyncSection>
              </div>
              <div className={styles.moneyLinks}>
                <Link href="/member/finance?tab=wallet">{l.walletLink}</Link>
                <Link href="/member/finance?tab=invoices">
                  {l.viewAllInvoices}
                </Link>
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
            <Link className={styles.sectionLink} href="/notifications">
              {t.memberPages.viewAll}
            </Link>
          </section>
        </div>
      </div>
    </MemberShell>
  );
}
