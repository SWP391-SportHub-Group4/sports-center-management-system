"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Tabs } from "@/components/primitives";
import { Loading } from "@/components/ui";
import { ReportFilterBar, useReportLocation } from "./report-filter-bar";
import {
  asReportFilters,
  blankDimensions,
  normalizeDimensions,
  reportContextUrl,
  reportLabels as labels,
  reportTabs as tabs,
  reportQueryDefaults,
  sameDimensions,
  samePeriod,
  tabScope,
  type ReportTab,
  type ReportDimensions,
  type readReportContext,
} from "./report-filter-config";
import {
  ClassesView,
  CourtsView,
  MembersView,
  RevenueView,
} from "./report-dashboard-views";
import { PointsView } from "./points-dashboard-view";
import s from "./reports-dashboard.module.css";

const initialDimensions = () =>
  Object.fromEntries(tabs.map((tab) => [tab, blankDimensions()])) as Record<
    ReportTab,
    ReportDimensions
  >;
export function ReportsDashboard() {
  const location = useReportLocation();
  if (!location.ready) return <Loading />;
  return (
    <DashboardWorkspace
      initial={location.context}
      today={location.today}
      tab={location.context.tab}
      onRemember={(tab, period, dimensions, replace) => {
        const params = new URLSearchParams(
          reportContextUrl("/manager/reports", tab, period, dimensions).split(
            "?",
          )[1],
        );
        location.setValues(
          { ...reportQueryDefaults, ...Object.fromEntries(params) },
          { replace },
        );
      }}
    />
  );
}
function DashboardWorkspace({
  initial,
  today,
  tab,
  onRemember,
}: {
  initial: ReturnType<typeof readReportContext>;
  today: string;
  tab: ReportTab;
  onRemember: (
    tab: ReportTab,
    period: ReturnType<typeof readReportContext>["period"],
    dimensions: ReportDimensions,
    replace: boolean,
  ) => void;
}) {
  const [draft, setDraft] = useState(initial.period),
    [applied, setApplied] = useState(initial.period);
  const initialDims = () => ({
    ...initialDimensions(),
    [initial.tab]: initial.dimensions,
  });
  const [dimensions, setDimensions] = useState(initialDims),
    [appliedDimensions, setAppliedDimensions] = useState(initialDims);
  const contextKey = reportContextUrl(
    "",
    initial.tab,
    initial.period,
    initial.dimensions,
  );
  const [previousContext, setPreviousContext] = useState(contextKey);
  // Next can preserve this page when returning from Export. Reconcile external
  // navigation, while leaving each bookmark's drafts intact on our own tab changes.
  if (previousContext !== contextKey) {
    setPreviousContext(contextKey);
    if (!samePeriod(initial.period, applied)) {
      setDraft(initial.period);
      setApplied(initial.period);
    }
    if (!sameDimensions(initial.dimensions, appliedDimensions[initial.tab])) {
      setDimensions({ ...dimensions, [initial.tab]: initial.dimensions });
      setAppliedDimensions({
        ...appliedDimensions,
        [initial.tab]: initial.dimensions,
      });
    }
  }
  const dim = normalizeDimensions(tabScope[tab], dimensions[tab]),
    current = normalizeDimensions(tabScope[tab], appliedDimensions[tab]);
  const changed = !samePeriod(draft, applied) || !sameDimensions(dim, current);
  const filters = useMemo(
    () =>
      asReportFilters(
        applied,
        normalizeDimensions(tabScope[tab], appliedDimensions[tab]),
      ),
    [applied, appliedDimensions, tab],
  );
  const View = {
    revenue: RevenueView,
    points: PointsView,
    rentals: CourtsView,
    classes: ClassesView,
    members: MembersView,
  }[tab];
  return (
    <div className={s.page}>
      <header className={s.header}>
        {changed ? (
          <button
            className="btn btn--ghost"
            disabled
            title="Apply changes before exporting"
          >
            <Download size={16} aria-hidden="true" />
            Export
          </button>
        ) : (
          <Link
            className="btn btn--ghost"
            href={reportContextUrl(
              "/manager/reports/exports",
              tab,
              applied,
              current,
            )}
          >
            <Download size={16} aria-hidden="true" />
            Export
          </Link>
        )}
      </header>
      <ReportFilterBar
        scope={tabScope[tab]}
        label={labels[tab]}
        draft={draft}
        applied={applied}
        dimensions={dim}
        appliedDimensions={current}
        today={today}
        onPeriodChange={setDraft}
        onDimensionsChange={(next) =>
          setDimensions({ ...dimensions, [tab]: next })
        }
        onApply={() => {
          setApplied({ ...draft });
          setAppliedDimensions({ ...appliedDimensions, [tab]: dim });
          onRemember(tab, draft, dim, true);
        }}
        onReset={() => {
          setDimensions({ ...dimensions, [tab]: blankDimensions() });
          setAppliedDimensions({
            ...appliedDimensions,
            [tab]: blankDimensions(),
          });
          onRemember(tab, applied, blankDimensions(), true);
        }}
      />
      <Tabs
        animatedIndicator
        value={tab}
        ariaLabel="Report dashboards"
        tabs={tabs.map((id) => ({ id, label: labels[id] }))}
        onChange={(id) =>
          onRemember(
            id as ReportTab,
            applied,
            normalizeDimensions(
              tabScope[id as ReportTab],
              appliedDimensions[id as ReportTab],
            ),
            false,
          )
        }
      >
        <div
          key={`${tab}-${JSON.stringify(applied)}-${JSON.stringify(appliedDimensions[tab])}`}
          className={s.view}
        >
          <View selection={applied} filters={filters} today={today} />
        </div>
      </Tabs>
    </div>
  );
}
