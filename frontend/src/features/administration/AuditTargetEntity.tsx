"use client";
import { useLanguage } from "@/lib/language";
import type { AuditLogDto } from "@/lib/types";
import {
  recordedAuditTarget,
  managerAuditSnapshot,
  currentReference,
  auditReferenceKinds,
} from "./manager-audit-metadata";
import styles from "./AuditTargetAccount.module.css";
import { settingLabels } from "@/features/catalog";

export function AuditTargetEntity({ row }: { row: AuditLogDto }) {
  const { t } = useLanguage();
  const l = t.managerAudit;
  const recorded = recordedAuditTarget(row);
  const snapshot = {
    ...managerAuditSnapshot(row.oldValue, row),
    ...managerAuditSnapshot(row.newValue, row),
  };
  const contextField = (
    {
      RoomBlock: "roomId",
      IncidentNotice: "roomId",
      SportServiceOffering: "sportId",
      ClassSession: "classId",
      PaymentAdjustment: "invoiceItemId",
    } as Record<string, string>
  )[row.targetEntity];
  const contextId = contextField ? snapshot[contextField] : undefined;
  const related =
    typeof contextId === "number" || typeof contextId === "string"
      ? currentReference(row, auditReferenceKinds[contextField], contextId)
      : undefined;
  const rawName = recorded ?? row.currentTargetLabel ?? related;
  const settingKey =
    row.targetEntity === "SystemSetting"
      ? settingLabels[rawName ?? row.targetId]
      : undefined;
  const name = settingKey ? t.settingFields[settingKey].label : rawName;
  const label =
    l.entities[row.targetEntity as keyof typeof l.entities] ?? row.targetEntity;
  const display = name
    ?.split(" · ")
    .map(
      (part) =>
        t.reportExportAudit.types[
          part as keyof typeof t.reportExportAudit.types
        ] ??
        l.codes[part as keyof typeof l.codes] ??
        part,
    )
    .join(" · ");
  const title = (
    <>
      {label}
      {display && row.targetEntity !== "ReportExport" ? ` · ${display}` : ""}
    </>
  );
  return (
    <div className={styles.root}>
      <strong>{title}</strong>
      {!name && <span className="small muted">{l.nameUnavailable}</span>}
    </div>
  );
}
