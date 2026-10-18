"use client";
import { Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type { RevenueDimensionsDto, RevenueReportDto } from "@/lib/types";
import { MemberName } from "@/components/RecordName";
import {
  CollectionCharts,
  ReportMetrics,
  ReportPanel,
  ReportRecords,
} from "./report-visuals";
import styles from "./reports.module.css";
export function RevenueRows({
  rows,
  showSource = true,
}: {
  rows: RevenueReportDto["bySportAndSource"];
  showSource?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const names: Record<string, string> = {
    MEMBERSHIP: l.sourceMembership,
    CLASS_PACKAGE: l.sourceClass,
    RENTAL: l.sourceRental,
    RECONCILIATION: l.sourceReconciliation,
    LEGACY_UNCLASSIFIED: l.sourceLegacy,
  };
  return (
    <Table
      headers={[
        ...(showSource ? [l.source] : []),
        l.sport,
        t.ptOps.members,
        l.cash,
        l.redeemedPoints,
        l.redeemed,
      ]}
    >
      {rows.map((r, i) => (
        <tr key={i}>
          {showSource && <td>{names[r.source] ?? r.source}</td>}
          <td>{r.sportName ?? "—"}</td>
          <td>
            {r.memberId ? (
              <MemberName
                id={r.memberId}
                name={
                  "memberName" in r
                    ? (r.memberName as string | null)
                    : undefined
                }
              />
            ) : (
              "—"
            )}
          </td>
          <td>{formatMoney(r.cashCollected)}</td>
          <td>{formatPoints(r.pointsRedeemed)}</td>
          <td>{formatMoney(r.pointsRedeemed * 1000)}</td>
        </tr>
      ))}
    </Table>
  );
}
export function RevenueSummary({ report }: { report: RevenueDimensionsDto }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <ReportPanel
      title="Filtered collections"
      description="The selected dates, sport, source and member apply to these figures and charts."
    >
      <ReportMetrics
        items={[
          {
            label: l.cash,
            value: formatMoney(report.cashCollected),
            hint: "Actual cash collected",
          },
          {
            label: l.redeemedPoints,
            value: formatPoints(
              report.rows.reduce((sum, row) => sum + row.pointsRedeemed, 0),
            ),
            hint: "Points spent on the selected services",
          },
          {
            label: l.redeemed,
            value: formatMoney(report.pointsRedeemedVnd),
            hint: "Points equivalent, not additional cash",
          },
        ]}
      />
      <CollectionCharts report={report} />
      <ReportRecords
        title="Collection records"
        count={`${report.rows.length} rows`}
      >
        <RevenueRows rows={report.rows} />
        {!report.rows.length && (
          <p className={styles.empty}>{t.common.noData}</p>
        )}
      </ReportRecords>
    </ReportPanel>
  );
}
