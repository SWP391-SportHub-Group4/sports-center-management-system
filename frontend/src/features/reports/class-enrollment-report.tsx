"use client";
import Link from "next/link";
import { StatusChip, Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { ClassEnrollmentReportDto } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { EnrollmentBars } from "./monthly-analysis-charts";
import { ReportMetrics, ReportPanel, ReportRecords } from "./report-visuals";
import styles from "./reports.module.css";
export function ClassEnrollmentReport({
  report,
}: {
  report: ClassEnrollmentReportDto;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const active = report.classes.filter(
    (row) => !["CANCELLED", "DRAFT"].includes(row.status.toUpperCase()),
  );
  const capacity = active.reduce((sum, row) => sum + row.capacity, 0);
  const confirmed = active.reduce((sum, row) => sum + row.confirmedCount, 0);
  const holds = active.reduce((sum, row) => sum + row.activeHoldCount, 0);
  return (
    <ReportPanel
      title="Class enrollment"
      description="Current seat counts for non-cancelled courses starting within the selected period and sport."
    >
      <ReportMetrics
        items={[
          { label: "Courses", value: formatNumber(active.length) },
          {
            label: "Confirmed enrollments",
            value: formatNumber(confirmed),
            hint: `${formatNumber(capacity)} total seats`,
          },
          {
            label: "Seats held",
            value: formatNumber(holds),
            hint: "Unpaid checkout holds",
          },
          {
            label: "Occupancy",
            value: `${capacity ? ((confirmed / capacity) * 100).toFixed(1) : "0"}%`,
            hint: "Confirmed seats / total capacity",
          },
        ]}
      />
      <EnrollmentBars
        rows={active}
        emptyMessage="No published courses match this period and sport. Try another date range."
      />
      <ReportRecords
        title="Class details"
        count={`${report.classes.length} courses, including cancelled`}
      >
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
                <Link href={`/manager/classes/${r.classId}`}>{r.name}</Link> ·{" "}
                <StatusChip value={r.status} />
              </td>
              <td>{r.sportName}</td>
              <td>{r.capacity}</td>
              <td>{r.confirmedCount}</td>
              <td>{r.activeHoldCount}</td>
              <td>{r.availableSeats}</td>
              <td>
                <div className={styles.occupancyCell}>
                  <strong>{(r.fillRatio * 100).toFixed(1)}%</strong>
                  <progress
                    value={r.confirmedCount}
                    max={Math.max(1, r.capacity)}
                    aria-label={`${r.name}: ${r.confirmedCount} confirmed of ${r.capacity} seats`}
                  />
                </div>
              </td>
              <td>
                {r.breakEvenThreshold ?? "—"} ·{" "}
                <StatusChip value={r.thresholdStatus} />
              </td>
            </tr>
          ))}
        </Table>
        {!report.classes.length && <p>{t.common.noData}</p>}
      </ReportRecords>
    </ReportPanel>
  );
}
