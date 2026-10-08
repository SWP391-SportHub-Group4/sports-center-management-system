import type { AuditLogDto } from "@/lib/types";

export type AuditValue = string | number | boolean | null | (string | number)[];
export type AuditSnapshot = Record<string, AuditValue>;
// Explicit public operation fields only. Unknown nested objects, credentials,
// notification bodies and fingerprints never enter the display model.
const scalarFields = new Set([
  "name",
  "code",
  "description",
  "imageUrl",
  "fullName",
  "email",
  "phone",
  "status",
  "role",
  "isActive",
  "active",
  "enabled",
  "isEnabled",
  "sortOrder",
  "capacity",
  "price",
  "costAmount",
  "durationDays",
  "sessionLimit",
  "defaultSessionMinutes",
  "defaultMaxCapacity",
  "serviceType",
  "sportId",
  "roomId",
  "roomTypeId",
  "classId",
  "coachId",
  "currentCoachId",
  "requestedCoachId",
  "memberId",
  "ownerId",
  "ownerUserId",
  "invoiceId",
  "invoiceItemId",
  "invoiceNumber",
  "packageId",
  "entitlementId",
  "sessionId",
  "makeupSessionId",
  "sessionNo",
  "startDate",
  "endDate",
  "startAtUtc",
  "endAtUtc",
  "startUtc",
  "endUtc",
  "requestedStartAtUtc",
  "numSessions",
  "sessions",
  "thresholdStatus",
  "thresholdDeadlineUtc",
  "breakEvenThreshold",
  "confirmedCount",
  "activeHoldCount",
  "refundPoints",
  "sessionsNotProvided",
  "points",
  "pointsApplied",
  "availableAfter",
  "heldAfter",
  "direction",
  "confirmationId",
  "revision",
  "version",
  "systemCalculatedPoints",
  "approvedPoints",
  "centerFault",
  "ledgerEntryId",
  "sourceType",
  "scope",
  "cancelledRentals",
  "blockedRooms",
  "recipientCount",
  "sendInApp",
  "sendEmail",
  "subject",
  "fromDate",
  "toDate",
  "format",
  "source",
  "reportType",
  "totalAmount",
  "allowStacking",
  "reason",
  "reviewNote",
  "totalQuota",
  "quotaState",
  "timingClassification",
  "requestType",
  "renewedMemberPackageId",
  "newValidityEndDate",
  "paidVia",
  "targetClassId",
  "choice",
  "resolutionStatus",
  "newStartAtUtc",
  "replacementSessionId",
  "timing",
]);
const arrayFields = new Set([
  "sportIds",
  "roomTypeIds",
  "offeringIds",
  "movedSessionIds",
  "unmovedSessionIds",
  "columns",
]);
const serviceTypes = [
  "MembershipAccess",
  "GroupCourse",
  "CourtRental",
  "PersonalTraining",
];
const lowerFirst = (key: string) => key.charAt(0).toLowerCase() + key.slice(1);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const scalar = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

export function managerAuditSnapshot(
  raw: string | null,
  row: Pick<AuditLogDto, "action" | "targetEntity">,
): AuditSnapshot {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const wrapper = object(parsed) ? parsed : {};
    const data = Object.hasOwn(wrapper, "value") ? wrapper.value : parsed;
    const result: AuditSnapshot = {};
    const hours = (items: unknown) => {
      if (
        !Array.isArray(items) ||
        !items.every(
          (v) =>
            typeof v === "string" &&
            /^[0-6]:(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/.test(
              v,
            ),
        )
      )
        return;
      for (let day = 0; day < 7; day++)
        result[`hours.${day}`] =
          items.find((v) => v.startsWith(`${day}:`))?.slice(2) ?? null;
    };
    if (Array.isArray(data)) {
      if (row.action === "SET_ROOM_OPENING_HOURS") hours(data);
      if (
        row.action === "SET_ROOM_TYPE_SPORTS" &&
        data.every((v) => Number.isSafeInteger(v) && v > 0)
      )
        result.sportIds = [...data].sort((a, b) => a - b);
    } else if (object(data)) {
      for (const [rawKey, value] of Object.entries(data)) {
        const key = lowerFirst(rawKey);
        // Activating/deactivating a sport can reorder it automatically.
        // That bookkeeping is not part of the status change shown to managers.
        if (
          key === "sortOrder" &&
          row.targetEntity === "Sport" &&
          ["ACTIVATE_SPORT", "DEACTIVATE_SPORT"].includes(row.action)
        )
          continue;
        if (scalarFields.has(key) && scalar(value)) result[key] = value;
        else if (
          arrayFields.has(key) &&
          Array.isArray(value) &&
          value.every(
            (v) =>
              typeof v === "string" ||
              (typeof v === "number" && Number.isFinite(v)),
          )
        )
          result[key] = [...value].sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { numeric: true }),
          );
        else if (key === "hours") hours(value);
        else if (
          key === "profile" &&
          row.targetEntity === "UserAccount" &&
          object(value)
        ) {
          for (const [field, item] of Object.entries(value)) {
            const normalized = lowerFirst(field);
            if (["fullName", "phone"].includes(normalized) && scalar(item))
              result[normalized] = item;
          }
        } else if (
          key === "services" &&
          row.targetEntity === "Sport" &&
          Array.isArray(value)
        ) {
          for (const item of value) {
            if (typeof item === "string" && serviceTypes.includes(item))
              result[`service.${item}.enabled`] = true;
            else if (object(item)) {
              const fields = Object.fromEntries(
                Object.entries(item).map(([k, v]) => [lowerFirst(k), v]),
              );
              const type =
                typeof fields.serviceType === "number"
                  ? serviceTypes[fields.serviceType]
                  : fields.serviceType;
              if (typeof type !== "string" || !serviceTypes.includes(type))
                continue;
              for (const field of [
                "isEnabled",
                "defaultSessionMinutes",
                "defaultMaxCapacity",
              ])
                if (scalar(fields[field]))
                  result[`service.${type}.${field}`] = fields[field];
            }
          }
        } else if (
          key === "affectedSources" &&
          row.targetEntity === "IncidentNotice" &&
          Array.isArray(value)
        ) {
          for (const item of value)
            if (object(item)) {
              const type = item.sourceType ?? item.SourceType;
              const id = item.sourceId ?? item.SourceId;
              if (
                typeof type === "string" &&
                [
                  "ClassSession",
                  "PtSession",
                  "CourtRental",
                  "RoomBlock",
                ].includes(type) &&
                typeof id === "string"
              )
                result[`affected.${type}.${id}`] = id;
            }
        }
      }
      // System settings intentionally store a scalar value; other opaque values stay hidden.
      if (row.targetEntity === "SystemSetting" && scalar(data.value))
        result.settingValue = data.value;
    } else if (row.targetEntity === "SystemSetting" && scalar(data))
      result.settingValue = data;
    if (typeof wrapper.reason === "string") result.reason = wrapper.reason;
    return result;
  } catch {
    return {};
  }
}

export function recordedAuditTarget(row: AuditLogDto): string | undefined {
  if (row.targetEntity === "SystemSetting") return row.targetId;
  for (const raw of [row.newValue, row.oldValue]) {
    try {
      const parsed: unknown = JSON.parse(raw ?? "null");
      const data =
        object(parsed) && object(parsed.value) ? parsed.value : parsed;
      if (!object(data)) continue;
      const keys =
        row.targetEntity === "Notification"
          ? ["subject"]
          : row.targetEntity === "ReportExport"
            ? ["reportType"]
            : [
                  "Sport",
                  "Room",
                  "RoomType",
                  "Class",
                  "MembershipPackage",
                ].includes(row.targetEntity)
              ? ["name", "Name"]
              : [];
      for (const key of ["targetName", ...keys])
        if (typeof data[key] === "string" && data[key].trim())
          return row.targetEntity === "SportServiceOffering" &&
            typeof data.serviceType === "string"
            ? `${data[key]} · ${data.serviceType}`
            : data[key];
      if (
        row.targetEntity === "CourtRate" &&
        typeof data.roomTypeName === "string"
      )
        return data.roomTypeName;
    } catch {
      /* Try the other snapshot before falling back to current data or ID. */
    }
  }
}

export const auditReferenceKinds: Record<string, string> = {
  sportId: "Sport",
  sportIds: "Sport",
  roomId: "Room",
  roomTypeId: "RoomType",
  roomTypeIds: "RoomType",
  offeringIds: "SportServiceOffering",
  classId: "Class",
  targetClassId: "Class",
  coachId: "UserAccount",
  currentCoachId: "UserAccount",
  requestedCoachId: "UserAccount",
  memberId: "UserAccount",
  ownerId: "UserAccount",
  ownerUserId: "UserAccount",
  invoiceId: "Invoice",
  invoiceItemId: "InvoiceItem",
  packageId: "MembershipPackage",
  entitlementId: "PtEntitlement",
  makeupSessionId: "ClassSession",
  movedSessionIds: "PtSession",
  unmovedSessionIds: "PtSession",
  renewedMemberPackageId: "MemberPackage",
  replacementSessionId: "PtSession",
};

export function currentReference(
  row: AuditLogDto,
  entity: string,
  id: string | number,
): string | undefined {
  const key = `${entity}:${id}`.toLowerCase();
  return Object.entries(row.referenceNames ?? {}).find(
    ([entry]) => entry.toLowerCase() === key,
  )?.[1];
}
