"use client";
import { Stat } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatDate, formatPoints } from "@/lib/format";
import type { RevenueReportDto } from "@/lib/types";
import { ReportMetrics, ReportPanel } from "./report-visuals";
import styles from "./reports.module.css";
export function PointsReport({ report: r }: { report: RevenueReportDto }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <ReportPanel
      title={l.points}
      description={`${formatDate(r.fromDate)} – ${formatDate(r.toDate)} · All sports and members. Only the date range applies to this ledger.`}
    >
      <ReportMetrics
        items={[
          { label: l.redeemedPoints, value: formatPoints(r.pointsRedeemed) },
          {
            label: l.pointsRefunded,
            value: formatPoints(r.pointsRefunded),
            hint: "Included in points issued",
          },
          { label: l.issued, value: formatPoints(r.pointsIssued) },
          { label: l.adjusted, value: formatPoints(r.managerPointAdjustment) },
        ]}
      />
      <div className={styles.currentBalance}>
        <div>
          <h3>{l.currentPointBalance}</h3>
          <p>{l.currentPointHint}</p>
        </div>
        <Stat label={l.outstanding} value={formatPoints(r.outstandingPoints)} />
      </div>
    </ReportPanel>
  );
}
