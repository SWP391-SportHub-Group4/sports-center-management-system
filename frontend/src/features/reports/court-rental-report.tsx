"use client";
import { Card } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { RevenueDimensionsDto } from "@/lib/types";
import { RevenueRows } from "./revenue-summary";
export function CourtRentalReport({
  report,
}: {
  report: RevenueDimensionsDto;
}) {
  const { t } = useLanguage();
  return (
    <Card title={t.staffWork.rentals}>
      <RevenueRows rows={report.rows} showSource={false} />
      {!report.rows.length && <p>{t.common.noData}</p>}
    </Card>
  );
}
