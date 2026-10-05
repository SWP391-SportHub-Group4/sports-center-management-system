"use client";
import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { AsyncSection, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatDate, todayIso } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type {
  MemberPackageDto,
  PtEntitlementDto,
  InvoiceSummaryDto,
  Paged,
} from "@/lib/types";
import { walletApi } from "@/features/wallet/api";
import { WalletBalance } from "@/features/wallet/wallet-balance";
import { memberSchedule } from "@/features/member/api";
import {
  notificationsApi,
  memberNotificationHref,
} from "@/features/member/notifications-api";
import styles from "@/features/member/member.module.css";

export default function MemberDashboardPage() {
  const { t } = useLanguage();
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
  return (
    <MemberShell
      title={t.memberOverview.title}
      description={t.memberOverview.description}
    >
      <nav className={styles.links} aria-label={t.memberOverview.title}>
        <Link href="/member/schedule">{t.memberPages.schedule}</Link>
        <Link href="/member/courses">{t.memberPages.courses}</Link>
        <Link href="/member/services">{t.memberPages.services}</Link>
        <Link href="/courses">{t.memberPages.discover}</Link>
      </nav>
      <div className={styles.layout}>
        <div className="stack">
          <section className={styles.section}>
            <h2>{t.memberPages.nextSession}</h2>
            <AsyncSection state={schedule}>
              {(rows) => {
                const upcoming = rows
                  .filter(
                    (s) =>
                      new Date(s.endAtUtc).getTime() > now &&
                      !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(
                        s.status ?? "",
                      ),
                  )
                  .slice(0, 5);
                return upcoming.length ? (
                  <ul className={styles.list}>
                    {upcoming.map((s) => (
                      <li className={styles.item} key={s.id}>
                        <Link href="/member/schedule">
                          <strong>{s.title}</strong>
                        </Link>
                        <p>
                          {formatDateTime(s.startAtUtc)} · {s.roomName || "—"}
                        </p>
                        <StatusChip value={s.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t.memberPages.noUpcoming}</p>
                );
              }}
            </AsyncSection>
            <Link href="/member/schedule">{t.memberPages.viewAll}</Link>
          </section>
          <section className={styles.section}>
            <h2>{t.memberPages.notifications}</h2>
            <AsyncSection
              state={notifications}
              isEmpty={(rows) => !rows.length}
              emptyMessage={t.memberPages.emptyNotifications}
            >
              {(rows) => (
                <ul className={styles.list}>
                  {rows.slice(0, 5).map((n) => (
                    <li className={styles.item} key={n.notificationId}>
                      <p>{n.message}</p>
                      <Link
                        href={memberNotificationHref(n) ?? "/notifications"}
                      >
                        {t.refactor.details}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </AsyncSection>
            <Link href="/notifications">{t.memberPages.viewAll}</Link>
          </section>
          <section className={styles.section}>
            <h2>{t.memberPages.pending}</h2>
            <AsyncSection
              state={invoices}
              isEmpty={(data) => !pagedItems(data).length}
            >
              {(data) => (
                <ul className={styles.list}>
                  {pagedItems(data).map((i) => (
                    <li className={styles.item} key={i.invoiceId}>
                      <Link href={`/member/invoices/${i.invoiceId}`}>
                        {i.invoiceNumber}
                      </Link>{" "}
                      · <StatusChip value={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </AsyncSection>
            <Link href="/member/finance?tab=invoices">
              {t.refactor.invoices}
            </Link>
          </section>
        </div>
        <div className="stack">
          <section className={styles.section}>
            <h2>{t.wallet.title}</h2>
            <AsyncSection state={wallet}>
              {(data) => <WalletBalance balance={data} />}
            </AsyncSection>
            <Link href="/member/finance?tab=wallet">{t.wallet.history}</Link>
          </section>
          <section className={styles.section}>
            <h2>{t.memberPages.gym}</h2>
            <AsyncSection state={packages} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <ul className={styles.list}>
                  {rows.map((p) => (
                    <li className={styles.item} key={p.memberPackageId}>
                      <strong>{p.packageName}</strong>
                      <p>
                        {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      </p>
                      <StatusChip value={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </AsyncSection>
            <Link href="/member/services">{t.memberPages.viewAll}</Link>
          </section>
          <section className={styles.section}>
            <h2>{t.memberPages.pt}</h2>
            <AsyncSection state={pt} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <ul className={styles.list}>
                  {rows.map((e) => (
                    <li className={styles.item} key={e.entitlementId}>
                      <strong>{e.coachName}</strong>
                      <p>
                        {t.memberPages.remaining}: {e.remainingQuota}/
                        {e.totalQuota}
                      </p>
                      <StatusChip value={e.status} />
                    </li>
                  ))}
                </ul>
              )}
            </AsyncSection>
            <Link href="/member/services?tab=pt">{t.memberPages.viewAll}</Link>
          </section>
        </div>
      </div>
    </MemberShell>
  );
}
