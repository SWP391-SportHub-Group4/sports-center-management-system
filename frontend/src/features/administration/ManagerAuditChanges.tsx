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
import { AuditChange } from "./AuditChange";
import styles from "./MembershipAuditChanges.module.css";

export function ManagerAuditChanges({ row }: { row: AuditLogDto }) {
  const { t } = useLanguage();
  const l = t.managerAudit;
  const before = managerAuditSnapshot(row.oldValue, row);
  const after = managerAuditSnapshot(row.newValue, row);
  if (row.targetEntity === "PtSession" && after.newStartAtUtc) {
    after.startAtUtc = after.newStartAtUtc;
    delete after.newStartAtUtc;
  }
  const comparison = row.oldValue !== null && row.newValue !== null;
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter(
    (key) =>
      ![
        "ledgerEntryId",
        "code",
        "confirmationId",
        "revision",
        "version",
        "imageUrl",
        "replacementSessionId",
        "sessionId",
        "entitlementId",
        "ownerId",
        "ownerUserId",
        "timing",
        "timingClassification",
        "quotaState",
      ].includes(key) &&
      (!comparison ||
        JSON.stringify(before[key]) !== JSON.stringify(after[key])),
  );
  const code = (value: string): string =>
    l.codes[value as keyof typeof l.codes] ??
    t.wireStatus[
      value
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toUpperCase() as keyof typeof t.wireStatus
    ] ??
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
    return (l.fields[key as keyof typeof l.fields] ?? key).replace(
      /^ID\s+|\s+ID$/g,
      "",
    );
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
                ? `${currentReference(row, auditReferenceKinds[key], id) ?? l.nameUnavailable}`
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
        l.nameUnavailable
      );
    if (key === "sessionId")
      return (
        currentReference(
          row,
          row.targetEntity === "Attendance" ? "ClassSession" : "PtSession",
          String(item),
        ) ?? l.nameUnavailable
      );
    if (key.startsWith("affected."))
      return (
        currentReference(row, key.split(".")[1], String(item)) ??
        l.nameUnavailable
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
      {keys
        .sort((a, b) => {
          const priority = [
            "status",
            "startAtUtc",
            "points",
            "reason",
            "direction",
            "reviewNote",
            "name",
            "roomTypeId",
          ];
          const rank = (k: string) =>
            priority.includes(k) ? priority.indexOf(k) : priority.length;
          return rank(a) - rank(b);
        })
        .slice(0, 3)
        .map((key) => (
          <AuditChange
            key={key}
            label={label(key)}
            comparison={comparison && key !== "reason"}
            before={
              before[key] !== undefined ? value(key, before[key]) : undefined
            }
            after={
              after[key] !== undefined ? value(key, after[key]) : undefined
            }
          />
        ))}
    </div>
  );
}
