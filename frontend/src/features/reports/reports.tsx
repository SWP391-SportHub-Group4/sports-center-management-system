"use client";

import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Card, Field, Stat } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import type { SportDto } from "@/lib/types";
import { reportsApi, type ReportFilters } from "./api";
import { RevenueSummary } from "./revenue-summary";
import { PointsReport } from "./points-report";
import { ClassEnrollmentReport } from "./class-enrollment-report";
import { CourtRentalReport } from "./court-rental-report";
import { ReportExportPanel } from "./report-export-panel";
import styles from "./reports.module.css";

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

export function ReportFilterForm({
  initial,
  onApply,
}: {
  initial: ReportFilters;
  onApply: (filters: ReportFilters) => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(false);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/manager/sports", { signal }),
    [],
  );
  return (
    <Card>
      <form
        className={`form ${styles.filterForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          const days =
            (Date.parse(draft.toDate) - Date.parse(draft.fromDate)) / 86400000;
          if (!Number.isFinite(days) || days < 0 || days > 366) {
            setError(true);
            return;
          }
          setError(false);
          onApply({ ...draft });
        }}
      >
        <div className={styles.filterGrid}>
          <Field label={l.from}>
            <input
              type="date"
              required
              value={draft.fromDate}
              onChange={(event) =>
                setDraft({ ...draft, fromDate: event.target.value })
              }
            />
          </Field>
          <Field label={l.to}>
            <input
              type="date"
              required
              value={draft.toDate}
              onChange={(event) =>
                setDraft({ ...draft, toDate: event.target.value })
              }
            />
          </Field>
          <AsyncSection state={sports}>
            {(rows) => (
              <Field label={l.sport}>
                <select
                  value={draft.sportId}
                  onChange={(event) =>
                    setDraft({ ...draft, sportId: event.target.value })
                  }
                >
                  <option value="">{l.all}</option>
                  {rows.map((sport) => (
                    <option key={sport.sportId} value={sport.sportId}>
                      {sport.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </AsyncSection>
          <Field label={l.source}>
            <select
              value={draft.source}
              onChange={(event) =>
                setDraft({ ...draft, source: event.target.value })
              }
            >
              <option value="">{l.all}</option>
              {[
                ["MEMBERSHIP", l.sourceMembership],
                ["PT", l.sourcePt],
                ["CLASS_PACKAGE", l.sourceClass],
                ["RENTAL", l.sourceRental],
                ["RECONCILIATION", l.sourceReconciliation],
                ["LEGACY_UNCLASSIFIED", l.sourceLegacy],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={l.memberId}>
            <input
              value={draft.memberId}
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
              onChange={(event) =>
                setDraft({ ...draft, memberId: event.target.value })
              }
            />
          </Field>
        </div>
        {error && <p role="alert">{l.dateRange}</p>}
        <button className="btn">{l.apply}</button>
      </form>
    </Card>
  );
}

const REPORT_TABS = ["revenue", "rentals", "classes", "members"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

function RevenueTab({ filters: f }: { filters: ReportFilters }) {
  const dimensions = useApi((signal) => reportsApi.dimensions(f, signal), [f]);
  const summary = useApi((signal) => reportsApi.summary(f, signal), [f]);
  return (
    <>
      <AsyncSection state={dimensions}>
        {(report) => <RevenueSummary report={report} />}
      </AsyncSection>
      <AsyncSection state={summary}>
        {(report) => <PointsReport report={report} />}
      </AsyncSection>
    </>
  );
}
function RentalsTab({ filters: f }: { filters: ReportFilters }) {
  const rentals = useApi(
    (signal) => reportsApi.dimensions({ ...f, source: "RENTAL" }, signal),
    [f],
  );
  return (
    <AsyncSection state={rentals}>
      {(report) => <CourtRentalReport report={report} />}
    </AsyncSection>
  );
}
function ClassesTab({ filters: f }: { filters: ReportFilters }) {
  const classes = useApi((signal) => reportsApi.classes(f, signal), [f]);
  return (
    <AsyncSection state={classes}>
      {(report) => <ClassEnrollmentReport report={report} />}
    </AsyncSection>
  );
}
function MembersTab({ filters: f }: { filters: ReportFilters }) {
  const { t } = useLanguage();
  const membership = useApi((signal) => reportsApi.membership(f, signal), [f]);
  return (
    <Card title={t.staffWork.membership}>
      <AsyncSection state={membership}>
        {(report) => (
          <div className="stats-grid">
            <Stat label={t.staffWork.newMembers} value={report.newMembers} />
            <Stat
              label={t.staffWork.activeMembers}
              value={report.activeMembersAtPeriodEnd}
            />
          </div>
        )}
      </AsyncSection>
    </Card>
  );
}

/** Báo cáo (Q22): một bộ lọc kỳ dùng chung, mỗi tab một nhóm số liệu; xuất tệp ở trang riêng. */
export function Reports() {
  const { t } = useLanguage();
  const f = t.finOps;
  const [filters, setFilters] = useState(initialFilters);
  const { values, setValues } = useUrlQuery(
    { tab: "revenue" },
    { tab: choiceQuery([...REPORT_TABS], "revenue") },
  );
  const tab = values.tab as ReportTab;
  const labels: Record<ReportTab, string> = {
    revenue: f.tabRevenue,
    rentals: f.tabRentals,
    classes: f.tabClasses,
    members: f.tabMembers,
  };
  return (
    <>
      <ReportFilterForm initial={filters} onApply={setFilters} />
      <div className="btn-row">
        <Link className="btn btn--secondary" href="/manager/reports/exports">
          {f.exportsLink}
        </Link>
      </div>
      <Tabs
        tabs={REPORT_TABS.map((id) => ({ id, label: labels[id] }))}
        value={tab}
        ariaLabel={f.reportsTabsLabel}
        onChange={(id) => setValues({ tab: id })}
      >
        <div className="stack">
          {tab === "revenue" && <RevenueTab filters={filters} />}
          {tab === "rentals" && <RentalsTab filters={filters} />}
          {tab === "classes" && <ClassesTab filters={filters} />}
          {tab === "members" && <MembersTab filters={filters} />}
        </div>
      </Tabs>
    </>
  );
}

/** Xuất báo cáo và lịch sử tệp (Q23). */
export function ReportExports() {
  const { t } = useLanguage();
  const f = t.finOps;
  const [filters, setFilters] = useState(initialFilters);
  return (
    <div className={styles.page}>
      <Link className={`btn btn--ghost ${styles.back}`} href="/manager/reports">
        ← {f.backToReports}
      </Link>
      <ReportFilterForm initial={filters} onApply={setFilters} />
      <ReportExportPanel filters={filters} />
    </div>
  );
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
              <Stat label={l.cash} value={formatMoney(report.totalCollected)} />
              <Stat
                label={l.redeemed}
                value={formatMoney(report.pointsRedeemedVnd)}
              />
              <Stat
                label={l.issued}
                value={formatPoints(report.pointsIssued)}
              />
              <Stat
                label={l.outstanding}
                value={formatPoints(report.outstandingPoints)}
              />
            </div>
          )}
        </AsyncSection>
        <AsyncSection state={membership}>
          {(report) => (
            <div className="stats-grid">
              <Stat label={l.newMembers} value={report.newMembers} />
              <Stat
                label={l.activeMembers}
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
        </div>
      </Card>
    </>
  );
}
