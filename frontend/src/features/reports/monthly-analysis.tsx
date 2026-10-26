"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { AsyncSection } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, formatNumber } from "@/lib/format";
import { useApi, useNow } from "@/lib/useApi";
import { vietnamLocal } from "@/lib/vietnam-time";
import { reportsApi, type ReportFilters } from "./api";
import { CashTrend, RevenueMix, ExactMoney } from "./monthly-analysis-charts";
import styles from "./manager-overview.module.css";
import { RecordedAttendance } from "./recorded-attendance";
import { CourtBookingSummary } from "./court-booking-summary";

export { currentCourseRows } from "./monthly-analysis-data";

function Metric({
  label,
  value,
  children,
  loading,
  unavailable,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
  loading: boolean;
  unavailable: boolean;
}) {
  const id = useId();
  return (
    <section className={styles.metric} aria-labelledby={id} aria-busy={loading}>
      <h3 id={id}>{label}</h3>
      <div className={styles.metricValue}>
        {loading ? (
          <span className={styles.skeleton} aria-label="Loading" />
        ) : unavailable ? (
          <span className={styles.unavailable}>Unavailable</span>
        ) : (
          value
        )}
      </div>
      <div className={styles.metricContext}>
        {!loading && !unavailable && children}
      </div>
    </section>
  );
}

export function MonthlyAnalysis() {
  const now = useNow();
  const today = vietnamLocal(new Date(now).toISOString()).slice(0, 10);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const period = useMemo(() => {
    const filters: ReportFilters = {
      fromDate: `${today.slice(0, 8)}01`,
      toDate: today,
      sportId: "",
      source: "",
      memberId: "",
    };
    return {
      filters,
      monthFilters: {
        ...filters,
        toDate: new Date(
          Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10),
      },
      label: new Intl.DateTimeFormat("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(`${today}T12:00:00+07:00`)),
    };
  }, [today]);
  const revenue = useApi(
    (signal) => reportsApi.summary(period.filters, signal),
    [period],
  );
  const review = useApi(
    (signal) => reportsApi.classesNeedingReview(signal),
    [today],
  );
  const membership = useApi(
    (signal) => reportsApi.membershipSummary(today, signal),
    [today],
  );
  const classStatus = useApi(
    (signal) => reportsApi.classStatus(signal),
    [today],
  );
  const support = useApi(
    (signal) => api.get<{ overdue: number }>("/api/member-support-requests/stats", { signal }),
    [],
  );
  const reviewCount = review.data?.totalCount ?? 0;
  const bookings = useApi(
    (signal) => reportsApi.courtBookings(period.monthFilters, signal),
    [period],
  );
  const attendance = useApi(
    (signal) => reportsApi.attendance(period.filters, signal),
    [period],
  );
  const { reload: reloadRevenue } = revenue;
  const { reload: reloadReview } = review;
  const { reload: reloadMembership } = membership;
  const { reload: reloadBookings } = bookings;
  const { reload: reloadAttendance } = attendance;
  const { reload: reloadClassStatus } = classStatus;
  useEffect(() => {
    let lastRefresh = 0;
    const refreshVisible = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastRefresh < 1500
      )
        return;
      lastRefresh = Date.now();
      reloadRevenue();
      reloadReview();
      reloadMembership();
      reloadBookings();
      reloadAttendance();
      reloadClassStatus();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(refreshVisible, 60_000);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(interval);
    };
  }, [
    reloadRevenue,
    reloadReview,
    reloadMembership,
    reloadBookings,
    reloadAttendance,
    reloadClassStatus,
  ]);
  const selectedDate =
    selectedDay?.startsWith(today.slice(0, 7)) && selectedDay <= today
      ? selectedDay
      : today;
  const partialError =
    revenue.error ||
    review.error ||
    membership.error ||
    attendance.error ||
    bookings.error ||
    classStatus.error;
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1>Overview</h1>
          <p>
            Collections & attendance · {formatDate(period.filters.fromDate)} –{" "}
            {formatDate(today)} · Vietnam time
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.period}>
            <CalendarDays size={16} aria-hidden="true" />
            {period.label}
          </span>
          <Link href="/manager/reports" className={styles.reportLink}>
            View reports <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {partialError && (
        <div className={styles.error} role="alert">
          <span>
            Some statistics are unavailable. Loaded sections remain visible.
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              if (revenue.error) revenue.reload();
              if (review.error) review.reload();
              if (membership.error) membership.reload();
              if (attendance.error) attendance.reload();
              if (bookings.error) bookings.reload();
              if (classStatus.error) classStatus.reload();
            }}
          >
            Retry
          </button>
        </div>
      )}
      <div className={styles.metrics}>
        <Metric
          label="Net collected"
          value={
            <>
              <ExactMoney amount={revenue.data?.netRevenue ?? 0} />
              <span className={styles.valueUnit}>VND</span>
            </>
          }
          loading={revenue.loading}
          unavailable={!!revenue.error}
        >
          <dl className={styles.cashCalculation}>
            <div>
              <dt>Collected</dt>
              <dd>
                <ExactMoney amount={revenue.data?.totalCollected ?? 0} />
              </dd>
            </div>
            <span aria-hidden="true">−</span>
            <div>
              <dt>Cash refunded</dt>
              <dd>
                <ExactMoney amount={revenue.data?.totalRefunded ?? 0} />
              </dd>
            </div>
          </dl>
        </Metric>
        <Metric
          label="Classes needing review"
          value={
            <span className={reviewCount > 0 ? styles.reviewCount : undefined}>
              {formatNumber(reviewCount)}
            </span>
          }
          loading={review.loading}
          unavailable={!!review.error}
        >
          <p>
            {reviewCount > 0
              ? "Below opening threshold · decision needed"
              : "No classes awaiting review"}
          </p>
          <small>Published classes flagged at risk · all dates</small>
          {reviewCount > 0 && (
            <Link
              href="/manager/classes?status=PUBLISHED&thresholdStatus=AT_RISK"
              className={styles.reviewLink}
            >
              Review classes <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          )}
        </Metric>
        <Metric
          label="Active Gym members"
          value={formatNumber(membership.data?.membersWithActiveMembership)}
          loading={membership.loading}
          unavailable={!!membership.error}
        >
          <p>Valid today · {formatDate(today)}</p>
          <small>Each member counted once · excludes day passes</small>
        </Metric>
        <Metric
          label="Bank payouts recorded"
          value={<><ExactMoney amount={revenue.data?.bankRefundPaid ?? 0} /><span className={styles.valueUnit}>VND</span></>}
          loading={revenue.loading}
          unavailable={!!revenue.error}
        >
          <p>{revenue.data?.bankRefundCount ?? 0} payout(s) this month</p>
          <small>Shown separately from cash refunds</small>
        </Metric>
      </div>
      <Link href="/manager/requests?type=support&overdue=1" className={styles.reportLink}>
        Overdue support requests: {support.data?.overdue ?? (support.loading ? "…" : "—")}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
      <section
        className={styles.classSummary}
        aria-labelledby="class-status-title"
      >
        <header>
          <h2 id="class-status-title">Classes</h2>
          <p>Current status · all classes · cancelled excluded</p>
        </header>
        <AsyncSection state={classStatus}>
          {(report) => (
            <dl className={styles.classCounts}>
              <div data-status="open">
                <dt>Open</dt>
                <dd>{formatNumber(report.open)}</dd>
                <dd className={styles.classDescription}>
                  Published or in progress
                </dd>
              </div>
              <div data-status="completed">
                <dt>Completed</dt>
                <dd>{formatNumber(report.completed)}</dd>
                <dd className={styles.classDescription}>Finished classes</dd>
              </div>
              <div data-status="unpublished">
                <dt>Unpublished</dt>
                <dd>{formatNumber(report.unpublished)}</dd>
                <dd className={styles.classDescription}>Draft classes</dd>
              </div>
            </dl>
          )}
        </AsyncSection>
      </section>
      <div className={styles.chartGrid}>
        <section
          className={`${styles.panel} ${styles.activityPanel}`}
          aria-labelledby="daily-collections-title"
        >
          <header className={styles.panelHeader}>
            <h2 id="daily-collections-title">Daily collections</h2>
            <p>Money received and retained after cash refunds · VND</p>
          </header>
          <AsyncSection state={revenue}>
            {(report) => (
              <CashTrend
                report={report}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDay}
              />
            )}
          </AsyncSection>
          <AsyncSection state={attendance}>
            {(report) => (
              <RecordedAttendance
                report={report}
                selectedDate={selectedDate}
                onSelect={setSelectedDay}
              />
            )}
          </AsyncSection>
        </section>
        <section
          className={styles.panel}
          aria-labelledby="collection-sources-title"
        >
          <header className={styles.panelHeader}>
            <h2 id="collection-sources-title">Collections by source</h2>
            <p>Share of total collected · VND</p>
          </header>
          <AsyncSection state={revenue}>
            {(report) => <RevenueMix report={report} />}
          </AsyncSection>
          <section
            className={styles.bookingSummary}
            aria-labelledby="court-booking-title"
          >
            <header className={styles.panelHeader}>
              <h2 id="court-booking-title">Court bookings</h2>
              <p>Full month · Bookings and booked hours by sport</p>
            </header>
            <AsyncSection state={bookings}>
              {(report) => <CourtBookingSummary report={report} />}
            </AsyncSection>
          </section>
        </section>
      </div>
      <p className={styles.footnote}>
        Recorded bank payouts are shown separately and do not reverse VNPay
        collections. Point refunds are tracked separately. Operating costs are not deducted.
      </p>
    </div>
  );
}
