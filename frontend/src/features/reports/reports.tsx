"use client";
import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Card, Stat } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatMoney, formatPoints } from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import { reportsApi, type ReportFilters } from "./api";
export { ReportsDashboard as Reports } from "./reports-dashboard";
export { ReportExports } from "./report-exports";
function initialFilters(): ReportFilters {
  const now = new Date();
  const toDate = vietnamLocal(now.toISOString()).slice(0, 10);
  return {
    fromDate: `${toDate.slice(0, 8)}01`,
    toDate,
    sportId: "",
    source: "",
    memberId: "",
  };
}

export function ManagerOverview() {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [filters] = useState(initialFilters);
  const summary = useApi(
    (signal) => reportsApi.summary(filters, signal),
    [filters],
  );
  const membership = useApi(
    (signal) => reportsApi.membership(filters, signal),
    [filters],
  );
  const classes = useApi(
    (signal) => reportsApi.classes(filters, signal),
    [filters],
  );

  return (
    <>
      <Card
        title={l.monthOverview}
        hint={`${filters.fromDate} – ${filters.toDate}`}
      >
        <AsyncSection state={summary}>
          {(report) => (
            <div className="stats-grid">
              <Stat
                label={l.redeemedPoints}
                value={formatPoints(report.pointsRedeemed)}
              />
              <Stat
                label={l.pointsRefunded}
                value={formatPoints(report.pointsRefunded)}
              />
              <Stat
                label={l.netRevenue}
                value={formatMoney(report.netRevenue)}
              />
              <Stat
                label={l.outstanding}
                value={formatPoints(report.outstandingPoints)}
              />
            </div>
          )}
        </AsyncSection>
        <p className="small muted">{l.revenueDefinitions}</p>
        <AsyncSection state={membership}>
          {(report) => (
            <div className="stats-grid">
              <Stat label={l.newMembers} value={report.newMembers} />
              <Stat
                label={l.purchasingMembers}
                value={report.membersPurchasingMembershipInPeriod}
              />
              <Stat
                label={l.activeMembers.replace(
                  "{date}",
                  formatDate(filters.toDate),
                )}
                value={report.activeMembersAtPeriodEnd}
              />
            </div>
          )}
        </AsyncSection>
        <AsyncSection state={classes}>
          {(report) => (
            <div className="stats-grid">
              <Stat label={l.courseCount} value={report.classes.length} />
            </div>
          )}
        </AsyncSection>
      </Card>
    </>
  );
}

export function ManagementShortcuts() {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <Card title={l.quickLinks}>
      <div className="btn-row">
        <Link className="btn btn--secondary" href="/manager/classes">
          {t.navigation.items.classes}
        </Link>
        <Link className="btn btn--secondary" href="/manager/points">
          {l.wallet}
        </Link>
        <Link
          className="btn btn--secondary"
          href="/manager/finance?tab=refunds"
        >
          {l.refunds}
        </Link>
        <Link className="btn btn--secondary" href="/manager/reports">
          {l.reports}
        </Link>
        <Link className="btn btn--secondary" href="/manager/audit-log">
          {l.audit}
        </Link>
        <Link className="btn btn--secondary" href="/manager/incidents">
          {t.operations.incidents}
        </Link>
      </div>
    </Card>
  );
}
