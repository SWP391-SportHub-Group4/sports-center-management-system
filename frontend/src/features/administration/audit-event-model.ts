import type { Translations } from "@/locales/en";
import type { AuditLogDto, RoomTypeDto } from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { auditDisplayText } from "./audit-display";
import { auditActionLabel } from "./audit-action-label";
import {
  auditReferenceKinds,
  currentReference,
  managerAuditSnapshot,
  recordedAuditTarget,
  type AuditValue,
  type AuditSnapshot,
} from "./manager-audit-metadata";

export function readableAuditLabel(value: string): string {
  const text = value
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return auditDisplayText(text.charAt(0).toUpperCase() + text.slice(1));
}

export function auditRecordType(row: AuditLogDto, t: Translations): string {
  const extra: Record<string, string> = {
    CourtRate: "Court rate",
    ClassRegistration: "Class registration",
  };
  return (
    t.managerAudit.entities[
      row.targetEntity as keyof typeof t.managerAudit.entities
    ] ??
    extra[row.targetEntity] ??
    readableAuditLabel(row.targetEntity)
  );
}

export function auditEventModel(
  row: AuditLogDto,
  t: Translations,
  roomTypes: RoomTypeDto[] = [],
) {
  const l = t.managerAudit;
  const before = managerAuditSnapshot(row.oldValue, row);
  const after = managerAuditSnapshot(row.newValue, row);
  const comparison = row.oldValue !== null && row.newValue !== null;
  const code = (item: string) =>
    l.codes[item as keyof typeof l.codes] ??
    t.wireStatus[item as keyof typeof t.wireStatus] ??
    readableAuditLabel(item);
  const fieldLabel = (key: string): string => {
    if (key.startsWith("hours."))
      return `Opening hours · ${t.operations.weekdays[Number(key.split(".")[1])]}`;
    if (key.startsWith("service.")) {
      const [, service, field] = key.split(".");
      return `${code(service)} · ${l.fields[field as keyof typeof l.fields] ?? readableAuditLabel(field)}`;
    }
    if (key.startsWith("affected."))
      return `Affected records · ${readableAuditLabel(key.split(".")[1])}`;
    const labels: Record<string, string> = {
      price: row.targetEntity === "CourtRate" ? "Price per hour" : "Price",
      days: "Applicable days",
      startTimeLocal: "Start time",
      endTimeLocal: "End time",
      sessionId: "Session",
      entitlementId: "Entitlement",
      ledgerEntryId: "Ledger entry",
      confirmationId: "Confirmation",
      replacementSessionId: "Replacement session",
    };
    return (
      labels[key] ??
      l.fields[key as keyof typeof l.fields] ??
      readableAuditLabel(key)
    );
  };
  const reference = (key: string, item: string | number) => {
    if (key === "roomTypeId" && row.targetEntity === "CourtRate") {
      return (
        currentReference(row, "RoomType", item) ??
        roomTypes.find((r) => String(r.roomTypeId) === String(item))?.name
      );
    }
    return currentReference(
      row,
      auditReferenceKinds[key] ?? "ClassSession",
      item,
    );
  };
  const format = (
    key: string,
    item: AuditValue | undefined,
    removed = false,
    snapshot: AuditSnapshot = after,
  ): string => {
    if (item === undefined) return "Not recorded";
    if (item === null) {
      if (key === "sessionLimit") return "Unlimited";
      if (key === "sportId" && row.targetEntity === "CourtRate")
        return "All compatible sports";
      if (key.startsWith("hours.")) return "Closed";
      return removed ? "Removed" : "None";
    }
    if (Array.isArray(item))
      return item.length
        ? item
            .map((v) =>
              key === "columns"
                ? readableAuditLabel(String(v))
                : auditDisplayText(reference(key, v) ?? String(v)),
            )
            .join(", ")
        : removed
          ? "Removed"
          : "None";
    if (
      auditReferenceKinds[key] ||
      key.endsWith("Id") ||
      key.startsWith("affected.")
    ) {
      const recordedName =
        key === "roomTypeId"
          ? snapshot.roomTypeName
          : key === "sportId"
            ? snapshot.sportName
            : undefined;
      const related =
        typeof recordedName === "string"
          ? recordedName
          : key.startsWith("affected.")
            ? currentReference(row, key.split(".")[1], String(item))
            : reference(key, String(item));
      return auditDisplayText(related ?? `#${item}`);
    }
    if (typeof item === "boolean")
      return /^(isActive|active|enabled|isEnabled)$/.test(key) ||
        /\.(isEnabled|enabled)$/.test(key)
        ? item
          ? "Active"
          : "Inactive"
        : item
          ? "Yes"
          : "No";
    if (typeof item === "number")
      return /^(price|costAmount|totalAmount)$/.test(key)
        ? formatMoney(item)
        : key === "durationDays"
          ? `${formatNumber(item)} ${item === 1 ? "day" : "days"}`
          : formatNumber(item);
    if (/^\d{4}-\d{2}-\d{2}$/.test(item) && key.endsWith("Date"))
      return formatDate(item);
    if (key.endsWith("Utc") && !Number.isNaN(Date.parse(item)))
      return formatDateTime(item);
    if (key === "format") return item.toUpperCase();
    if (key === "days")
      return item
        .split(",")
        .map(
          (day) =>
            ({
              SUN: "Sunday",
              MON: "Monday",
              TUE: "Tuesday",
              WED: "Wednesday",
              THU: "Thursday",
              FRI: "Friday",
              SAT: "Saturday",
            })[day.trim() as "MON"] ?? day,
        )
        .join(", ");
    if (
      [
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
        "paidVia",
        "choice",
        "source",
      ].includes(key)
    )
      return code(item);
    return auditDisplayText(item || (removed ? "Removed" : "None"));
  };
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter(
    (key) =>
      key !== "reason" &&
      key !== "reviewNote" &&
      (!comparison ||
        JSON.stringify(before[key]) !== JSON.stringify(after[key])),
  );
  const fields = keys.map((key) => {
    const item = row.newValue !== null ? after[key] : before[key];
    return {
      key,
      label: fieldLabel(key),
      before: format(key, before[key], false, before),
      after: format(key, after[key], comparison && before[key] != null, after),
      value: format(key, item, false, row.newValue !== null ? after : before),
      meaningful:
        comparison ||
        (item != null &&
          item !== "" &&
          (!Array.isArray(item) || item.length > 0)),
    };
  });
  const contextField = (
    {
      RoomBlock: "roomId",
      IncidentNotice: "roomId",
      SportServiceOffering: "sportId",
      ClassSession: "classId",
      PaymentAdjustment: "invoiceItemId",
      CourtRate: "roomTypeId",
    } as Record<string, string>
  )[row.targetEntity];
  const contextId = after[contextField] ?? before[contextField];
  const target =
    row.targetEntity === "UserAccount"
      ? row.targetFullName?.trim() || row.targetEmail?.trim()
      : (recordedAuditTarget(row) ??
        row.currentTargetLabel ??
        (typeof contextId === "string" || typeof contextId === "number"
          ? reference(contextField, contextId)
          : undefined));
  const subject = target
    ? row.targetEntity === "ReportExport"
      ? code(target)
      : auditDisplayText(target)
    : row.targetAccountExists === false
      ? "Account no longer exists"
      : row.targetEntity === "UserAccount"
        ? "Account information unavailable"
        : "Record name unavailable";
  const reason =
    after.reason ?? after.reviewNote ?? before.reason ?? before.reviewNote;
  const priority = [
    "status",
    "isActive",
    "active",
    "role",
    "price",
    "totalAmount",
    "approvedPoints",
    "durationDays",
    "startDate",
    "fromDate",
    "toDate",
    "capacity",
    "defaultSessionMinutes",
  ];
  const summary = fields
    .filter(
      (field) =>
        field.meaningful &&
        ![
          "name",
          "fullName",
          "email",
          "description",
          "imageUrl",
          "sortOrder",
        ].includes(field.key),
    )
    .sort((a, b) => {
      const rank = (key: string) => {
        const n = priority.indexOf(key);
        return n < 0 ? priority.length : n;
      };
      return rank(a.key) - rank(b.key);
    });
  return {
    subject,
    fields,
    comparison,
    reason: reason == null ? null : auditDisplayText(String(reason)),
    summary,
    action: auditActionLabel(row.action, row.newValue),
    type: auditRecordType(row, t),
    deletion: /^DELETE_|^REMOVE_/.test(row.action),
  };
}
