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
      description={`${dateLabel} · ${l.dateNote}`}
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
                return next ? (
                  <>
                    <div className={styles.nextSession} data-surface="inverse">
                      <div className={styles.nextTop}>
                        <span className={styles.activity}>
                          {next.type === "PT_SESSION"
                            ? t.memberPages.pt
                            : t.refactor.courses}
                        </span>
                        <StatusChip value={next.status} />
                      </div>
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
                          {upcoming.slice(1, 4).map((s) => (
                            <li key={s.id}>
                              <DateTile value={s.startAtUtc} />
                              <div>
                                <Link href={sessionHref(s)}>{s.title}</Link>
                                <p>
                                  {formatTime(s.startAtUtc)} –{" "}
                                  {formatTime(s.endAtUtc)} ·{" "}
                                  {s.roomName || l.notAssigned}
                                </p>
                              </div>
                              <StatusChip value={s.status} />
                            </li>
                          ))}
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

          <aside className={styles.benefits} aria-labelledby="benefits-title">
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
                        <StatusChip value={current.status} />
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
                        <StatusChip value={current.status} />
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
            <section className={styles.wallet} aria-labelledby="wallet-title">
              <h3 id="wallet-title">{t.wallet.title}</h3>
              <AsyncSection state={wallet}>
                {(balance) => <WalletBalance balance={balance} compact />}
              </AsyncSection>
              <Link href="/member/finance?tab=wallet">{l.walletLink}</Link>
            </section>
          </aside>
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
          <section className={styles.feed} aria-labelledby="payments-title">
            <div className={styles.sectionHeading}>
              <h2 id="payments-title">{l.payments}</h2>
              <IconInvoice size={22} aria-hidden="true" />
            </div>
            <AsyncSection state={invoices}>
              {(data) =>
                pagedItems(data).length ? (
                  <ul className={styles.feedList}>
                    {pagedItems(data)
                      .slice(0, 3)
                      .map((i) => (
                        <li key={i.invoiceId}>
                          <div>
                            <Link href={`/member/invoices/${i.invoiceId}`}>
                              {i.invoiceNumber}
                            </Link>
                            <p>
                              {formatMoney(i.outstanding)} ·{" "}
                              <StatusChip value={i.status} />
                            </p>
                          </div>
                          <Link href={`/member/invoices/${i.invoiceId}`}>
                            {l.viewInvoice}
                          </Link>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className={styles.quietEmpty}>
                    <strong>{l.noPayments}</strong>
                    <p>{l.noPaymentsHint}</p>
                  </div>
                )
              }
            </AsyncSection>
            <Link
              className={styles.sectionLink}
              href="/member/finance?tab=invoices"
            >
              {t.refactor.invoices}
            </Link>
          </section>
        </div>
      </div>
    </MemberShell>
  );
}
