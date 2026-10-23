"use client";
import { TableFilters } from "@/components/data/TableFilters";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw, SlidersHorizontal } from "lucide-react";
import { AsyncSection, Card, Field, Stat } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  addDaysIso,
  formatDate,
  formatMoney,
  formatPoints,
} from "@/lib/format";
import { vietnamLocal } from "@/lib/vietnam-time";
import type { SportDto, UserAdminDto } from "@/lib/types";
import { MemberPicker } from "@/components/MemberPicker";
import { reportsApi, type ReportFilters } from "./api";
import { ReportExportPanel, ReportTypeSelect } from "./report-export-panel";
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
  scope = "dimensions",
  children,
  selectedMember,
}: {
  initial: ReportFilters;
  onApply: (filters: ReportFilters, member?: UserAdminDto | null) => void;
  scope?: "dimensions" | "rentals" | "classes" | "period";
  children?: ReactNode;
  selectedMember?: UserAdminDto | null;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [draft, setDraft] = useState(initial);
  const [member, setMember] = useState<UserAdminDto | null>(
    selectedMember?.userId === initial.memberId ? selectedMember : null,
  );
  const [error, setError] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState(false);
  const now = useNow();
  const today = vietnamLocal(new Date(now).toISOString()).slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDaysIso(monthStart, -1);
  const presets = [
    { label: "This month", from: monthStart, to: today },
    {
      label: "Last month",
      from: `${lastMonthEnd.slice(0, 8)}01`,
      to: lastMonthEnd,
    },
    { label: "Last 30 days", from: addDaysIso(today, -29), to: today },
  ];
  const preset = presets.findIndex(
    (p) => p.from === draft.fromDate && p.to === draft.toDate,
  );
  const sports = useApi(
    (signal) =>
      scope === "period"
        ? Promise.resolve([] as SportDto[])
        : api.get<SportDto[]>("/api/manager/sports", { signal }),
    [scope],
  );
  const changed =
    draft.fromDate !== initial.fromDate ||
    draft.toDate !== initial.toDate ||
    (scope !== "period" && draft.sportId !== initial.sportId) ||
    (scope === "dimensions" && draft.source !== initial.source) ||
    (["dimensions", "rentals"].includes(scope) &&
      draft.memberId !== initial.memberId);
  return (
    <TableFilters>
      <section className={styles.filterPanel} aria-label="Report filters">
        <form
          className={`form ${styles.filterForm}`}
          onSubmit={(event) => {
            event.preventDefault();
            const days =
              (Date.parse(draft.toDate) - Date.parse(draft.fromDate)) /
              86400000;
            if (!Number.isFinite(days) || days < 0 || days > 366) {
              setError(true);
              return;
            }
            setError(false);
            const applied = {
              ...draft,
              sportId: scope === "period" ? "" : draft.sportId,
              source: scope === "dimensions" ? draft.source : "",
              memberId: ["dimensions", "rentals"].includes(scope)
                ? draft.memberId
                : "",
            };
            setDraft(applied);
            if (!applied.memberId) setMember(null);
            onApply(applied, applied.memberId ? member : null);
            setAppliedNotice(true);
          }}
        >
          <div className={styles.filterToolbar}>
            <span className={styles.filterTitle}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filters
            </span>
            <div
              className={styles.presets}
              role="group"
              aria-label="Date presets"
            >
              {presets.map((p, index) => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={preset === index}
                  onClick={() => {
                    setDraft({ ...draft, fromDate: p.from, toDate: p.to });
                    setError(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {children}
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
            {scope !== "period" && (
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
            )}
            {scope === "dimensions" && (
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
            )}
            {["dimensions", "rentals"].includes(scope) && (
              <MemberPicker
                scanner={false}
                placeholder={l.member}
                label={l.member}
                value={member}
                onChange={(next) => {
                  setMember(next);
                  setDraft({ ...draft, memberId: next?.userId ?? "" });
                }}
              />
            )}
          </div>
          {error && <p role="alert">{l.dateRange}</p>}
          <div className={styles.filterFooter}>
            <p
              role="status"
              className={changed ? styles.pendingFilters : undefined}
            >
              {changed
                ? "Changes not applied. Press Apply to update the report."
                : appliedNotice
                  ? "Filters applied. Showing the selected report."
                  : "Choose a period, refine the selection, then apply."}
            </p>
            <div className={styles.filterActions}>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  const next = {
                    fromDate: monthStart,
                    toDate: today,
                    sportId: "",
                    source: "",
                    memberId: "",
                  };
                  setDraft(next);
                  setMember(null);
                  setError(false);
                  onApply(next, null);
                  setAppliedNotice(true);
                }}
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset
              </button>
              <button className="btn" type="submit">
                {l.apply}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      </section>
    </TableFilters>
  );
}

export { ReportsDashboard as Reports } from "./reports-dashboard";

/** Xuất báo cáo và lịch sử tệp (Q23). */
export function ReportExports() {
  const { t } = useLanguage();
  const f = t.finOps;
  const [filters, setFilters] = useState(initialFilters);
  const [type, setType] = useState("REVENUE_DIMENSIONS");
  const scope =
    type === "REVENUE_DIMENSIONS"
      ? "dimensions"
      : type === "COURT_RENTAL_REVENUE"
        ? "rentals"
        : type === "CLASS_ENROLLMENT"
          ? "classes"
          : "period";
  return (
    <div className={styles.page}>
      <Link className={`btn btn--ghost ${styles.back}`} href="/manager/reports">
        ← {f.backToReports}
      </Link>
      <ReportFilterForm initial={filters} onApply={setFilters} scope={scope}>
        <ReportTypeSelect value={type} onChange={setType} />
      </ReportFilterForm>
      <ReportExportPanel filters={filters} type={type} />
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
