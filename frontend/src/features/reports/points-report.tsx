"use client";
import { Card, Stat } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatPoints } from "@/lib/format";
import type { RevenueReportDto } from "@/lib/types";
export function PointsReport({ report: r }: { report: RevenueReportDto }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <Card title={l.points} hint={l.globalPoints}>
      <div className="stats-grid">
        <Stat label={l.cash} value={formatMoney(r.totalCollected)} />
        <Stat label={l.redeemed} value={formatMoney(r.pointsRedeemedVnd)} />
        <Stat label={l.issued} value={formatPoints(r.pointsIssued)} />
        <Stat label={l.outstanding} value={formatPoints(r.outstandingPoints)} />
        <Stat
          label={l.adjusted}
          value={formatPoints(r.managerPointAdjustment)}
        />
        <Stat label={l.legacyCash} value={formatMoney(r.legacyCashCollected)} />
        <Stat
          label={l.reconciliationCash}
          value={formatMoney(r.reconciliationCashCollected)}
        />
      </div>
    </Card>
  );
}
