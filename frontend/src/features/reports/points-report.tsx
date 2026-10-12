"use client";
import { Card, Stat } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatDate, formatPoints } from "@/lib/format";
import type { RevenueReportDto } from "@/lib/types";
export function PointsReport({ report: r }: { report: RevenueReportDto }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <Card
      title={l.points}
      hint={`${formatDate(r.fromDate)} – ${formatDate(r.toDate)} · ${l.globalPoints}`}
    >
      <div className="stats-grid">
        <Stat label={l.redeemedPoints} value={formatPoints(r.pointsRedeemed)} />
        <Stat label={l.issued} value={formatPoints(r.pointsIssued)} />
        <Stat
          label={l.adjusted}
          value={formatPoints(r.managerPointAdjustment)}
        />
      </div>
      <h3>{l.currentPointBalance}</h3>
      <p>{l.currentPointHint}</p>
      <Stat label={l.outstanding} value={formatPoints(r.outstandingPoints)} />
    </Card>
  );
}
