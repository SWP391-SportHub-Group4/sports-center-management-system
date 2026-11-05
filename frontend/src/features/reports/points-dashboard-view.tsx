"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { formatDate, formatDateTime, formatPoints } from "@/lib/format";
import type { RevenueReportDto } from "@/lib/types";
import { reportsApi } from "./api";
import { DashboardChart } from "./dashboard-chart";
import { periodDays, reportPeriods } from "./report-periods";
import {
  ComparisonNotice,
  Details,
  Metric,
  PeriodNote,
  ReportState,
  sourceName,
  type ViewProps,
} from "./report-dashboard-views";
import s from "./reports-dashboard.module.css";

function PointHistory({ report }: { report: RevenueReportDto }) {
  const [page, setPage] = useState(0);
  const rows = report.daily;
  return (
    <>
      <div className={s.tableScroll}>
        <table>
          <caption className={s.note}>
            Daily point activity · {formatDate(report.fromDate)} –{" "}
            {formatDate(report.toDate)}
          </caption>
          <thead>
            <tr>
              {[
                "Date",
                "Points issued",
                "Points used",
                "Points refunded",
                "Manager adjustments",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 20, page * 20 + 20).map((day) => (
              <tr key={day.date}>
                <td>{formatDate(day.date)}</td>
                <td>{formatPoints(day.pointsIssued ?? 0)}</td>
                <td>{formatPoints(day.pointsRedeemed ?? 0)}</td>
                <td>{formatPoints(day.pointsRefunded ?? 0)}</td>
                <td>{formatPoints(day.managerPointAdjustment ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <td>{formatPoints(report.pointsIssued)}</td>
              <td>{formatPoints(report.pointsRedeemed)}</td>
              <td>{formatPoints(report.pointsRefunded)}</td>
              <td>{formatPoints(report.managerPointAdjustment)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 20 && (
        <div className={s.pager}>
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(rows.length / 20)}
          </span>
          <button
            type="button"
            disabled={(page + 1) * 20 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

export function PointsView({ selection, filters, today }: ViewProps) {
  const { primary, comparison } = reportPeriods(selection, today, true);
  const state = useApi(
    (signal) =>
      primary
        ? reportsApi.summary(
            { ...filters, ...primary, sportId: "", source: "" },
            signal,
          )
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const previous = useApi(
    (signal) =>
      comparison
        ? reportsApi.summary(
            { ...filters, ...comparison, sportId: "", source: "" },
            signal,
          )
        : Promise.resolve(null),
    [filters, selection, today],
  );
  const equal =
    !!primary && !!comparison && periodDays(primary) === periodDays(comparison);
  const chartRows = (
    report: RevenueReportDto,
    field: "pointsRedeemed" | "pointsIssued",
  ) =>
    report.daily.map((day) => ({
      date: day.date,
      value: day[field] ?? 0,
      detail: `Points issued ${formatPoints(day.pointsIssued ?? 0)} · Points used ${formatPoints(day.pointsRedeemed ?? 0)} · Points refunded ${formatPoints(day.pointsRefunded ?? 0)}`,
    }));
  return (
    <>
      <PeriodNote
        primary={primary}
        comparison={comparison}
        label="Point activity"
      />
      <ComparisonNotice state={previous} enabled={!!comparison} />
      {!primary && (
        <section className={s.panel}>
          <h2>Daily point activity</h2>
          <DashboardChart
            period={selection}
            rows={[]}
            label="Daily points used and issued"
            unit="points"
            seriesLabel="Points used"
            integerValues
          />
        </section>
      )}
      <ReportState state={state} name="Points">
        {(report) => {
          if (!report) return null;
          const sources = report.bySource
            .filter((row) => row.pointsRedeemed > 0)
            .sort((a, b) => b.pointsRedeemed - a.pointsRedeemed);
          const maximum = Math.max(
            1,
            ...sources.map((row) => row.pointsRedeemed),
          );
          return (
            <>
              <div className={s.metrics}>
                <Metric
                  label="Points used"
                  value={report.pointsRedeemed}
                  previous={previous.data?.pointsRedeemed}
                  equal={equal}
                  hint="Spent by members in the selected period"
                />
                <Metric
                  label="Points issued"
                  value={report.pointsIssued}
                  previous={previous.data?.pointsIssued}
                  equal={equal}
                  hint="Wallet credits, including refunds and compensation"
                />
                <Metric
                  label="Current balance"
                  value={report.outstandingPoints}
                  emphasis
                  hint={
                    <>
                      Available + held ·{" "}
                      {report.outstandingPointsAsOfUtc
                        ? formatDateTime(report.outstandingPointsAsOfUtc)
                        : formatDate(today)}
                    </>
                  }
                />
              </div>
              <div className={s.charts}>
                <section className={s.panel}>
                  <h2>Daily point activity</h2>
                  <DashboardChart
                    period={selection}
                    rows={chartRows(report, "pointsRedeemed")}
                    comparison={
                      previous.data
                        ? chartRows(previous.data, "pointsRedeemed")
                        : undefined
                    }
                    secondary={{
                      label: "Points issued",
                      unit: "points",
                      rows: chartRows(report, "pointsIssued"),
                      comparison: previous.data
                        ? chartRows(previous.data, "pointsIssued")
                        : undefined,
                    }}
                    label="Daily points used and issued"
                    seriesLabel="Points used"
                    unit="points"
                    legendUnit="Points"
                    integerValues
                  />
                </section>
                <section className={s.panel}>
                  <h2>Points used by source</h2>
                  <p className={s.note}>Where members spent their points</p>
                  <div className={s.bars}>
                    {sources.map((row) => (
                      <div key={row.source}>
                        <div className={s.barLabel}>
                          <b>{sourceName(row.source)}</b>
                          <span>
                            {formatPoints(row.pointsRedeemed)} pts ·{" "}
                            {report.pointsRedeemed > 0
                              ? (
                                  (row.pointsRedeemed / report.pointsRedeemed) *
                                  100
                                ).toFixed(1)
                              : "0"}
                            %
                          </span>
                        </div>
                        <div className={s.track}>
                          <i
                            style={{
                              width: `${(row.pointsRedeemed / maximum) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {!sources.length && (
                    <p className={s.empty}>No points used in this period.</p>
                  )}
                </section>
              </div>
              <section className={s.panel} aria-label="Other point activity">
                <dl className={s.points}>
                  <div>
                    <dt>Points refunded</dt>
                    <dd>{formatPoints(report.pointsRefunded)}</dd>
                    <p className={s.note}>Included in points issued</p>
                  </div>
                  <div>
                    <dt>Manager adjustments</dt>
                    <dd>{formatPoints(report.managerPointAdjustment)}</dd>
                    <p className={s.note}>Net adjustment during this period</p>
                  </div>
                </dl>
              </section>
              <Details title="View point details">
                <PointHistory
                  key={`${report.fromDate}-${report.toDate}-${filters.memberId}`}
                  report={report}
                />
              </Details>
              <p className={s.note}>
                Current balance is measured now
                {filters.memberId
                  ? " for the selected member"
                  : " across all member wallets"}
                , not at the end of the selected period. Points are tracked
                separately from cash.{" "}
                <Link href="/manager/points">Open Point Management</Link>
              </p>
            </>
          );
        }}
      </ReportState>
    </>
  );
}
