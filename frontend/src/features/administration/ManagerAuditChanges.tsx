"use client";

import { useLanguage } from "@/lib/language";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import type { AuditLogDto } from "@/lib/types";
import {
  auditReferenceKinds,
  currentReference,
  managerAuditSnapshot,
  type AuditValue,
} from "./manager-audit-metadata";
import styles from "./MembershipAuditChanges.module.css";

export function ManagerAuditChanges({ row }: { row: AuditLogDto }) {
  const { t } = useLanguage();
  const l = t.managerAudit;
  const before = managerAuditSnapshot(row.oldValue, row);
  const after = managerAuditSnapshot(row.newValue, row);
  const comparison = row.oldValue !== null && row.newValue !== null;
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter(
    (key) =>
      !comparison || JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  const code = (value: string): string =>
    l.codes[value as keyof typeof l.codes] ??
    t.wireStatus[value as keyof typeof t.wireStatus] ??
    value;
  const label = (key: string) => {
    if (key.startsWith("hours."))
      return `${l.fields.hours} · ${t.operations.weekdays[Number(key.split(".")[1])]}`;
    if (key.startsWith("service.")) {
      const [, type, field] = key.split(".");
      return `${code(type)} · ${l.fields[field as keyof typeof l.fields] ?? l.fields.enabled}`;
    }
    if (key.startsWith("affected."))
      return `${l.fields.affectedSources} · ${l.entities[key.split(".")[1] as keyof typeof l.entities] ?? key.split(".")[1]}`;
    return l.fields[key as keyof typeof l.fields] ?? key;
  };
  const value = (key: string, item: AuditValue | undefined): string => {
    if (item === undefined) return t.auditChanges.notRecorded;
    if (item === null)
      return key.startsWith("hours.")
        ? l.closed
        : key === "sessionLimit"
          ? t.auditChanges.unlimited
          : l.none;
    if (Array.isArray(item))
      return item.length
        ? item
            .map((id) =>
              auditReferenceKinds[key]
                ? `${currentReference(row, auditReferenceKinds[key], id) ?? `#${id}`}`
                : String(id),
            )
            .join(", ")
        : l.none;
    if (typeof item === "boolean")
      return ["isActive", "active", "enabled", "isEnabled"].includes(key) ||
        key.endsWith(".isEnabled") ||
        key.endsWith(".enabled")
        ? item
          ? l.codes.Active
          : l.codes.Inactive
        : item
          ? l.yes
          : l.no;
    if (auditReferenceKinds[key])
      return (
        currentReference(row, auditReferenceKinds[key], String(item)) ??
        `#${item}`
      );
    if (key === "sessionId")
      return (
        currentReference(
          row,
          row.targetEntity === "Attendance" ? "ClassSession" : "PtSession",
          String(item),
        ) ?? `#${item}`
      );
    if (key.startsWith("affected."))
      return (
        currentReference(row, key.split(".")[1], String(item)) ?? `#${item}`
      );
    if (key === "direction" && (item === 0 || item === 1))
      return item === 0 ? l.codes.Credit : l.codes.Debit;
    if (typeof item === "number")
      return ["price", "costAmount", "totalAmount"].includes(key)
        ? formatMoney(item)
        : formatNumber(item);
    if (
      [
        "startDate",
        "endDate",
        "fromDate",
        "toDate",
        "newValidityEndDate",
      ].includes(key)
    )
      return /^\d{4}-\d{2}-\d{2}$/.test(item) ? formatDate(item) : item;
    if (
      key.endsWith("Utc") &&
      /^\d{4}-\d{2}-\d{2}T/.test(item) &&
      !Number.isNaN(Date.parse(item))
    )
      return formatDateTime(item);
    return [
      "status",
      "role",
      "serviceType",
      "scope",
      "sourceType",
      "timing",
      "timingClassification",
      "requestType",
      "direction",
      "thresholdStatus",
      "resolutionStatus",
      "quotaState",
      "reportType",
    ].includes(key)
      ? code(item)
      : item;
  };
  if (!Object.keys(before).length && !Object.keys(after).length)
    return <p className="small muted">{t.auditChanges.unavailable}</p>;
  if (!keys.length)
    return <p className="small muted">{t.auditChanges.unchanged}</p>;
  return (
    <div className={styles.root}>
      {keys.map((key) => (
        <p key={key} className={styles.change}>
          <span>{label(key)}: </span>
          {key === "reason" ? (
            <span>{value(key, after[key] ?? before[key])}</span>
          ) : comparison ? (
            <>
              <span>
                <span className="sr-only">{t.auditChanges.before}: </span>
                <del>{value(key, before[key])}</del>
              </span>
              <span aria-hidden="true"> → </span>
              <strong>
                <span className="sr-only">{t.auditChanges.after}: </span>
                {value(key, after[key])}
              </strong>
            </>
          ) : (
            <span>
              {value(key, row.newValue !== null ? after[key] : before[key])}
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
