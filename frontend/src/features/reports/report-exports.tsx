"use client";

import Link from "next/link";
import { useState } from "react";
import { Loading, Field } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ReportFilterBar, useReportLocation } from "./report-filter-bar";
import {
  ReportExportPanel,
  ReportTypeSelect,
  reportExportTypes,
} from "./report-export-panel";
import {
  asReportFilters,
  blankDimensions,
  exportScope,
  normalizeDimensions,
  reportContextUrl,
  reportLabels,
  sameDimensions,
  samePeriod,
  tabForScope,
  reportQueryDefaults,
  type FilterScope,
  type readReportContext,
  type ReportDimensions,
} from "./report-filter-config";
import { reportPeriods, type PeriodSelection } from "./report-periods";
import styles from "./reports.module.css";
import s from "./report-filters.module.css";

export function ReportExports() {
  const location = useReportLocation();
  if (!location.ready) return <Loading />;
  return (
    <ExportWorkspace
      initial={location.context}
      today={location.today}
      onRemember={(type, period, dimensions) => {
        const params = new URLSearchParams(
          reportContextUrl(
            "/manager/reports/exports",
            tabForScope(exportScope(type)),
            period,
            dimensions,
            type,
          ).split("?")[1],
        );
        location.setValues(
          { ...reportQueryDefaults, ...Object.fromEntries(params) },
          { replace: true },
        );
      }}
    />
  );
}
function ExportWorkspace({
  initial,
  today,
  onRemember,
}: {
  initial: ReturnType<typeof readReportContext>;
  today: string;
  onRemember: (
    type: string,
    period: PeriodSelection,
    dimensions: ReportDimensions,
  ) => void;
}) {
  const [type, setType] = useState(
    reportExportTypes.includes(initial.type) ? initial.type : "REVENUE_SUMMARY",
  );
  const scope = exportScope(type),
    tab = tabForScope(scope);
  const [draft, setDraft] = useState(initial.period),
    [applied, setApplied] = useState(initial.period);
  const initialDims = () => ({
    cash: blankDimensions(),
    points: blankDimensions(),
    courts: blankDimensions(),
    classes: blankDimensions(),
    gyms: blankDimensions(),
    [exportScope(initial.type)]: normalizeDimensions(
      exportScope(initial.type),
      initial.dimensions,
    ),
  });
  const [dimensions, setDimensions] =
      useState<Record<FilterScope, ReportDimensions>>(initialDims),
    [appliedDimensions, setAppliedDimensions] =
      useState<Record<FilterScope, ReportDimensions>>(initialDims);
  const [side, setSide] = useState("primary");
  const initialType = reportExportTypes.includes(initial.type)
    ? initial.type
    : "REVENUE_SUMMARY";
  const contextKey = reportContextUrl(
    "",
    initial.tab,
    initial.period,
    initial.dimensions,
    initialType,
  );
  const [previousContext, setPreviousContext] = useState(contextKey);
  if (previousContext !== contextKey) {
    setPreviousContext(contextKey);
    if (type !== initialType) setType(initialType);
    if (!samePeriod(initial.period, applied)) {
      setDraft(initial.period);
      setApplied(initial.period);
    }
    const nextScope = exportScope(initialType);
    const nextDimensions = normalizeDimensions(nextScope, initial.dimensions);
    if (!sameDimensions(nextDimensions, appliedDimensions[nextScope])) {
      setDimensions({ ...dimensions, [nextScope]: nextDimensions });
      setAppliedDimensions({
        ...appliedDimensions,
        [nextScope]: nextDimensions,
      });
    }
  }
  const dim = normalizeDimensions(scope, dimensions[scope]),
    current = normalizeDimensions(scope, appliedDimensions[scope]);
  const changed = !samePeriod(draft, applied) || !sameDimensions(dim, current);
  const periods = reportPeriods(applied, today, type !== "CLASS_ENROLLMENT");
  const range =
    side === "comparison" && periods.comparison
      ? periods.comparison
      : periods.primary;
  const filters = asReportFilters({ ...applied, ...range }, current);
  const blockedReason = changed
    ? "Apply changes before exporting."
    : !range
      ? "No elapsed dates in this period. Choose a period with reported activity."
      : undefined;
  return (
    <div className={styles.page}>
      <Link
        className={`btn btn--ghost ${styles.back}`}
        href={reportContextUrl("/manager/reports", tab, applied, current)}
      >
        ← Back to reports
      </Link>
      <ReportFilterBar
        scope={scope}
        label={reportLabels[tab]}
        draft={draft}
        applied={applied}
        dimensions={dim}
        appliedDimensions={current}
        today={today}
        onPeriodChange={setDraft}
        onDimensionsChange={(next) =>
          setDimensions({ ...dimensions, [scope]: next })
        }
        onApply={() => {
          setApplied({ ...draft });
          setAppliedDimensions({ ...appliedDimensions, [scope]: dim });
          onRemember(type, draft, dim);
        }}
        onReset={() => {
          setDimensions({ ...dimensions, [scope]: blankDimensions() });
          setAppliedDimensions({
            ...appliedDimensions,
            [scope]: blankDimensions(),
          });
          onRemember(type, applied, blankDimensions());
        }}
      >
        <ReportTypeSelect
          value={type}
          onChange={(next) => {
            setType(next);
            onRemember(
              next,
              applied,
              normalizeDimensions(
                exportScope(next),
                appliedDimensions[exportScope(next)],
              ),
            );
          }}
        />
      </ReportFilterBar>
      {periods.comparison && (
        <div className={s.exportRange}>
          <Field label="Export period">
            <select value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="primary">
                Selected period ·{" "}
                {formatDate(periods.primary?.fromDate ?? applied.fromDate)} –{" "}
                {formatDate(periods.primary?.toDate ?? applied.toDate)}
              </option>
              <option value="comparison">
                Comparison period · {formatDate(periods.comparison.fromDate)} –{" "}
                {formatDate(periods.comparison.toDate)}
              </option>
            </select>
          </Field>
          <p>Export each period as a separate file.</p>
        </div>
      )}
      <ReportExportPanel
        filters={filters}
        type={type}
        blockedReason={blockedReason}
      />
    </div>
  );
}
