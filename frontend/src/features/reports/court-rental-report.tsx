"use client";
import { useLanguage } from "@/lib/language";
import type { RevenueDimensionsDto } from "@/lib/types";
import { RevenueRows } from "./revenue-summary";
import { formatMoney, formatPoints } from "@/lib/format";
import {
  CollectionCharts,
  ReportMetrics,
  ReportPanel,
  ReportRecords,
} from "./report-visuals";
import styles from "./reports.module.css";
export function CourtRentalReport({
  report,
}: {
  report: RevenueDimensionsDto;
}) {
  const { t } = useLanguage();
  return (
    <ReportPanel
      title="Court rental collections"
      description="Cash and points from rentals matching the selected dates, sport and member."
    >
      <ReportMetrics
        items={[
          {
            label: t.staffWork.cash,
            value: formatMoney(report.cashCollected),
            hint: "Rental cash collected in this period",
          },
          {
            label: t.staffWork.redeemedPoints,
            value: formatPoints(
              report.rows.reduce((sum, row) => sum + row.pointsRedeemed, 0),
            ),
          },
          {
            label: t.staffWork.redeemed,
            value: formatMoney(report.pointsRedeemedVnd),
            hint: "Points equivalent, kept separate from cash",
          },
        ]}
      />
      <CollectionCharts report={report} rentals />
      <ReportRecords
        title="Rental collection records"
        count={`${report.rows.length} rows`}
      >
        <RevenueRows rows={report.rows} showSource={false} />
        {!report.rows.length && (
          <p className={styles.empty}>{t.common.noData}</p>
        )}
      </ReportRecords>
    </ReportPanel>
  );
}
