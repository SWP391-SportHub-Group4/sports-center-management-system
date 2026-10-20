"use client";

import Link from "next/link";
import { useId, useMemo, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { AsyncSection, Stat } from "@/components/ui";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPoints,
} from "@/lib/format";
import { useApi, useNow } from "@/lib/useApi";
import { vietnamLocal } from "@/lib/vietnam-time";
import type { ClassEnrollmentReportDto, RevenueReportDto } from "@/lib/types";
import { reportsApi, type ReportFilters } from "./api";
import {
  CashTrend,
  RevenueMix,
  MembershipBars,
  EnrollmentBars,
} from "./monthly-analysis-charts";
import styles from "./monthly-analysis.module.css";

function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={`${styles.panel} ${className}`} aria-labelledby={id}>
      <header className={styles.panelHeader}>
        <h3 id={id}>{title}</h3>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  loading,
  unavailable,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <div className={styles.metric} aria-busy={loading}>
      <Stat
        label={label}
        value={
          loading ? (
            <span className={styles.skeleton} aria-label="Loading" />
          ) : unavailable ? (
            "—"
          ) : (
            value
          )
        }
      />
      <p>{unavailable ? "Unavailable. Retry the failed request." : hint}</p>
    </div>
  );
}

export function currentCourseRows(report: ClassEnrollmentReportDto) {
  // Cancelled courses have no seats available for sale and must not dilute occupancy.
  return report.classes.filter(
    (row) => !["CANCELLED", "DRAFT"].includes(row.status.toUpperCase()),
  );
}

function PointSummary({ report }: { report: RevenueReportDto }) {
  const scale = Math.max(report.pointsRedeemed, report.pointsRefunded, 1);
  const hasMovement = report.pointsRedeemed > 0 || report.pointsRefunded > 0;
  return (
    <div className={styles.points}>
      <header className={styles.pointsIntro}>
        <div>
          <h3>Points ledger</h3>
          <p>Monthly activity and the current wallet balance.</p>
        </div>
        <span className={styles.pointRate}>1 point = 1,000 VND</span>
      </header>
      <div className={styles.pointStats}>
        <div className={`${styles.pointMetric} ${styles.pointUsed}`}>
          <Stat
            label="Points used by members in period"
            value={formatPoints(report.pointsRedeemed)}
            hint="Month to date"
          />
        </div>
        <div className={`${styles.pointMetric} ${styles.pointRefunded}`}>
          <Stat
            label="Points refunded to members"
            value={formatPoints(report.pointsRefunded)}
            hint="Month to date"
          />
        </div>
        <div className={styles.pointMetric}>
          <Stat
            label="Current outstanding points (available + held)"
            value={formatPoints(report.outstandingPoints)}
            hint="All wallets · current snapshot"
          />
        </div>
      </div>
      {hasMovement ? (
        <figure className={styles.pointMovement}>
          <figcaption>Monthly movement</figcaption>
          {[
            {
              label: "Used",
              value: report.pointsRedeemed,
              color: "var(--court-700)",
            },
            {
              label: "Refunded",
              value: report.pointsRefunded,
              color: "var(--info-solid)",
            },
          ].map((item) => (
            <div key={item.label} className={styles.pointComparison}>
              <span>{item.label}</span>
              <div
                className={styles.pointTrack}
                role="img"
                aria-label={`${item.label}: ${formatPoints(item.value)}. Both bars use the same scale.`}
              >
                <span
                  style={{
                    width: `${(Math.max(0, item.value) / scale) * 100}%`,
                    background: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </figure>
      ) : (
        <p className={styles.pointEmpty}>
          No points used or refunded this month yet.
        </p>
      )}
    </div>
  );
}

/** Month-to-date cash and membership, plus live enrollment in courses starting this month. */
export function MonthlyAnalysis() {
  const now = useNow();
  const today = vietnamLocal(new Date(now).toISOString()).slice(0, 10);
  const period = useMemo(() => {
    const [year, month] = today.split("-").map(Number);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const filters: ReportFilters = {
      fromDate: `${today.slice(0, 8)}01`,
      toDate: today,
      sportId: "",
      source: "",
      memberId: "",
    };
    return {
      filters,
      courses: { ...filters, toDate: end },
      days: Number(end.slice(-2)),
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
  const courses = useApi(
    (signal) => reportsApi.classes(period.courses, signal),
    [period],
  );
  const membership = useApi(
    (signal) => reportsApi.membership(period.filters, signal),
    [period],
  );
  const courseRows = courses.data ? currentCourseRows(courses.data) : [];
  const confirmed = courseRows.reduce(
    (sum, row) => sum + row.confirmedCount,
    0,
  );
  const capacity = courseRows.reduce((sum, row) => sum + row.capacity, 0);
  const occupancy = capacity ? Math.round((confirmed / capacity) * 100) : 0;
  const partialError = revenue.error || courses.error || membership.error;
  return (
    <div className={styles.dashboard}>
      <header className={styles.toolbar}>
        <div className={styles.title}>
          <h2>Statistical analysis</h2>
          <p>Your center at a glance, this month.</p>
        </div>
        <div className={styles.actions}>
          <span className={styles.period}>
            <CalendarDays size={17} aria-hidden="true" />
            {period.label}
          </span>

          <Link className="btn" href="/manager/reports">
            Reports
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <p className={styles.periodNote}>
        Month to date: {formatDate(period.filters.fromDate)} –{" "}
        {formatDate(today)} · Vietnam time (UTC+7)
      </p>
      {partialError && (
        <div className={styles.errorNotice} role="alert">
          Some statistics could not be loaded. Available sections remain
          visible.
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => {
              if (revenue.error) revenue.reload();
              if (courses.error) courses.reload();
              if (membership.error) membership.reload();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <section className={styles.metrics} aria-label="Monthly key figures">
        <Metric
          label="Cash collected (VND)"
          value={formatMoney(revenue.data?.totalCollected)}
          hint={`${formatNumber(revenue.data?.paymentCount)} successful payments · month to date`}
          loading={revenue.loading}
          unavailable={!!revenue.error}
        />
        <Metric
          label="Net revenue (VND)"
          value={formatMoney(revenue.data?.netRevenue)}
          hint="Cash collected less completed cash refunds"
          loading={revenue.loading}
          unavailable={!!revenue.error}
        />
        <Metric
          label="Confirmed enrollments"
          value={formatNumber(confirmed)}
          hint={`${formatNumber(courseRows.length)} courses starting this month · ${occupancy}% filled`}
          loading={courses.loading}
          unavailable={!!courses.error}
        />
        <Metric
          label="New member accounts"
          value={formatNumber(membership.data?.newMembers)}
          hint="Accounts created from the first of this month"
          loading={membership.loading}
          unavailable={!!membership.error}
        />
      </section>

      <div className={styles.primaryGrid}>
        <Panel
          title="Daily cash flow"
          description="Cash collected and net revenue by payment/refund date. Future dates have no results."
        >
          <AsyncSection state={revenue}>
            {(report) => (
              <CashTrend report={report} today={today} days={period.days} />
            )}
          </AsyncSection>
        </Panel>
        <Panel
          title="Where collections come from"
          description="Share of cash collected. Points used are excluded."
        >
          <AsyncSection state={revenue}>
            {(report) => <RevenueMix report={report} />}
          </AsyncSection>
        </Panel>
      </div>

      <div className={styles.secondaryGrid}>
        <Panel
          title="Class occupancy by sport"
          description={`Live enrollment for non-cancelled courses starting ${formatDate(period.filters.fromDate)} – ${formatDate(period.courses.toDate)}.`}
        >
          <AsyncSection state={courses}>
            {(report) => <EnrollmentBars rows={currentCourseRows(report)} />}
          </AsyncSection>
          <Link
            className={styles.detailLink}
            href="/manager/reports?tab=classes"
          >
            View class enrollment
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </Panel>
        <Panel
          title="Membership activity"
          description="New accounts and purchases this month; active Gym members as of today."
        >
          <AsyncSection state={membership}>
            {(report) => <MembershipBars report={report} />}
          </AsyncSection>
          <Link
            className={styles.detailLink}
            href="/manager/reports?tab=members"
          >
            View member report
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </Panel>
      </div>

      <section
        className={styles.ledger}
        aria-label="Monthly points and current balance"
      >
        <AsyncSection state={revenue}>
          {(report) => <PointSummary report={report} />}
        </AsyncSection>
      </section>
      <p className={styles.definition}>
        Cash figures use successful collections and completed cash refunds.
        Points refunds remain in the points ledger. Class and membership counts
        describe different populations and should not be added together.
      </p>
    </div>
  );
}
