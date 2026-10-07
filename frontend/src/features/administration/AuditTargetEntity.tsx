"use client";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { AuditLogDto } from "@/lib/types";
import {
  recordedAuditTarget,
  managerAuditSnapshot,
  currentReference,
  auditReferenceKinds,
} from "./manager-audit-metadata";
import styles from "./AuditTargetAccount.module.css";

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
  const name = recorded ?? row.currentTargetLabel ?? related;
  const label =
    l.entities[row.targetEntity as keyof typeof l.entities] ?? row.targetEntity;
  const display = name
    ?.split(" · ")
    .map((part) => l.codes[part as keyof typeof l.codes] ?? part)
    .join(" · ");
  // Only link targets the API resolved from existing records, and only to
  // supported Manager detail routes. A recorded historical name alone is not proof.
  const numericId = /^[1-9]\d*$/.test(row.targetId);
  const href = row.currentTargetLabel
    ? row.targetEntity === "Class" && numericId
      ? `/manager/classes/${row.targetId}`
      : row.targetEntity === "Room" && numericId
        ? `/manager/facilities/${row.targetId}`
        : row.targetEntity === "ClassSession" &&
            /^[1-9]\d*$/.test(String(snapshot.classId))
          ? `/manager/classes/${snapshot.classId}?tab=sessions`
          : undefined
    : undefined;
  const title = (
    <>
      {label}
      {display ? ` · ${display}` : ""}
    </>
  );
  return (
    <div className={styles.root}>
      <strong>{href ? <Link href={href}>{title}</Link> : title}</strong>
      <span className="small muted">ID: {row.targetId}</span>
      {name && !recorded && (
        <span className="small muted">{l.currentName}</span>
      )}
      {!name && <span className="small muted">{l.nameUnavailable}</span>}
    </div>
  );
}
