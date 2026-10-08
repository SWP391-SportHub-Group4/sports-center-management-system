"use client";
import { Card } from "@/components/ui";
import { Metric, MetricGrid } from "@/components/data";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type { RevenueReportDto } from "@/lib/types";
export function PointsReport({ report: r }: { report: RevenueReportDto }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <Card title={l.points} hint={l.globalPoints}>
      <MetricGrid>
        <Metric label={l.cash} value={formatMoney(r.totalCollected)} />
        <Metric label={l.redeemed} value={formatMoney(r.pointsRedeemedVnd)} />
        <Metric label={l.issued} value={formatPoints(r.pointsIssued)} />
        <Metric
          label={l.outstanding}
          value={formatPoints(r.outstandingPoints)}
        />
        <Metric
          label={l.adjusted}
          value={formatPoints(r.managerPointAdjustment)}
        />
        <Metric
          label={l.legacyCash}
          value={formatMoney(r.legacyCashCollected)}
        />
        <Metric
          label={l.reconciliationCash}
          value={formatMoney(r.reconciliationCashCollected)}
        />
      </MetricGrid>
    </Card>
  );
}
