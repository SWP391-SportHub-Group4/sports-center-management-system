"use client";

import { useLanguage } from "@/lib/language";
import { formatDate } from "@/lib/format";
import type { AuditLogDto } from "@/lib/types";
import { managerAuditSnapshot } from "./manager-audit-metadata";
import { AuditChange } from "./AuditChange";
import styles from "./MembershipAuditChanges.module.css";

export function ReportExportAuditDetails({ row }: { row: AuditLogDto }) {
  const { t } = useLanguage();
  const l = t.reportExportAudit;
  const snapshot = {
    ...managerAuditSnapshot(row.oldValue, row),
    ...managerAuditSnapshot(row.newValue, row),
  };
  const missing = t.auditChanges.notRecorded;
  const reportType = snapshot.reportType ?? row.currentTargetLabel;
  const type =
    typeof reportType === "string" && reportType.trim()
      ? (l.types[reportType as keyof typeof l.types] ?? reportType)
      : missing;
  const date = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? formatDate(value)
      : missing;
  const period = `${date(snapshot.fromDate)} – ${date(snapshot.toDate)}`;
  const format =
    typeof snapshot.format === "string" && snapshot.format.trim()
      ? snapshot.format.toUpperCase()
      : missing;
  const data =
    Array.isArray(snapshot.columns) && snapshot.columns.length
      ? snapshot.columns
          .map(
            (column) =>
              l.columns[column as keyof typeof l.columns] ?? String(column),
          )
          .join(", ")
      : missing;

  return (
    <div className={styles.root}>
      <AuditChange label={t.managerAudit.fields.reportType} after={type} />
      <AuditChange label={l.period} after={period} />
      <AuditChange label={t.managerAudit.fields.format} after={format} />
      <AuditChange label={l.data} after={data} />
    </div>
  );
}
