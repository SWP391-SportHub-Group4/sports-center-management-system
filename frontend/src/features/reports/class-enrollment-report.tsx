"use client";
import { Card, StatusChip, Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { ClassEnrollmentReportDto } from "@/lib/types";
export function ClassEnrollmentReport({
  report,
}: {
  report: ClassEnrollmentReportDto;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  return (
    <Card title={l.enrollment}>
      <Table
        headers={[
          l.title,
          l.sport,
          l.capacity,
          l.confirmed,
          l.holds,
          l.available,
          l.fillRatio,
          l.threshold,
        ]}
      >
        {report.classes.map((r) => (
          <tr key={r.classId}>
            <td>
              {r.name} · <StatusChip value={r.status} />
            </td>
            <td>{r.sportName}</td>
            <td>{r.capacity}</td>
            <td>{r.confirmedCount}</td>
            <td>{r.activeHoldCount}</td>
            <td>{r.availableSeats}</td>
            <td>{(r.fillRatio * 100).toFixed(1)}%</td>
            <td>
              {r.breakEvenThreshold ?? "—"} ·{" "}
              <StatusChip value={r.thresholdStatus} />
            </td>
          </tr>
        ))}
      </Table>
      {!report.classes.length && <p>{t.common.noData}</p>}
    </Card>
  );
}
