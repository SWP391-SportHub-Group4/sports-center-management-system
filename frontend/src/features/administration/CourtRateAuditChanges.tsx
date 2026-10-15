"use client";

import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import type { AuditLogDto, RoomTypeDto } from "@/lib/types";
import styles from "./MembershipAuditChanges.module.css";

type Snapshot = Partial<{
  roomTypeId: number;
  roomTypeName: string;
  sportId: number | null;
  sportName: string;
  days: string;
  startTimeLocal: string;
  endTimeLocal: string;
  price: number;
  active: boolean;
}>;
const dayCodes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const dayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
type Key = "roomTypeId" | "sportId" | "days" | "window" | "price" | "active";
const fields: Key[] = [
  "roomTypeId",
  "sportId",
  "days",
  "window",
  "price",
  "active",
];

// Changes always come from the event. Current reference names are display-only
// fallbacks for legacy snapshots, never replacements for prices or times.
function snapshot(raw: string | null): Snapshot {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const wrapper = parsed as Record<string, unknown>;
    const data =
      wrapper.value &&
      typeof wrapper.value === "object" &&
      !Array.isArray(wrapper.value)
        ? (wrapper.value as Record<string, unknown>)
        : wrapper;
    const result: Snapshot = {};
    for (const key of ["roomTypeId", "sportId"] as const) {
      const value = data[key];
      if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
        result[key] = value;
    }
    if (data.sportId === null) result.sportId = null;
    for (const key of ["roomTypeName", "sportName"] as const) {
      if (typeof data[key] === "string" && data[key].trim())
        result[key] = data[key];
    }
    if (typeof data.price === "number" && Number.isFinite(data.price))
      result.price = data.price;
    if (typeof data.active === "boolean") result.active = data.active;
    if (typeof data.days === "string") {
      const days = data.days.split(",").map((d) => d.trim().toUpperCase());
      if (days.length && days.every((d) => dayCodes.includes(d)))
        result.days = dayOrder.filter((d) => days.includes(d)).join(",");
    }
    for (const key of ["startTimeLocal", "endTimeLocal"] as const) {
      if (
        typeof data[key] === "string" &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data[key])
      )
        result[key] = data[key];
    }
    return result;
  } catch {
    return {};
  }
}

function recorded(key: Key, data: Snapshot) {
  return key === "window"
    ? data.startTimeLocal !== undefined || data.endTimeLocal !== undefined
    : data[key] !== undefined;
}
function equal(key: Key, before: Snapshot, after: Snapshot) {
  return key === "window"
    ? before.startTimeLocal === after.startTimeLocal &&
        before.endTimeLocal === after.endTimeLocal
    : before[key] === after[key];
}

export function needsCourtRateRoomNames(row: AuditLogDto): boolean {
  return (
    row.targetEntity === "CourtRate" &&
    [row.oldValue, row.newValue].some((raw) => {
      const data = snapshot(raw);
      return data.roomTypeId !== undefined && !data.roomTypeName;
    })
  );
}

export function CourtRateAuditChanges({
  row,
  roomTypes = [],
}: {
  row: AuditLogDto;
  roomTypes?: RoomTypeDto[];
}) {
  const { t } = useLanguage();
  const l = t.auditChanges;
  const c = t.courtRateAudit;
  const before = snapshot(row.oldValue);
  const after = snapshot(row.newValue);
  const hasAfter = Object.keys(after).length > 0;
  const comparison =
    row.action === "UPDATE_COURT_RATE" ||
    (row.oldValue !== null && row.newValue !== null);
  const changed = fields.filter((key) =>
    comparison
      ? !equal(key, before, after)
      : recorded(key, hasAfter ? after : before),
  );
  const labels: Record<Key, string> = {
    roomTypeId: t.operations.roomType,
    sportId: t.operations.sport,
    days: c.days,
    window: t.managerCatalog.timeWindow,
    price: c.pricePerHour,
    active: l.status,
  };
  const roomName = (data: Snapshot) =>
    data.roomTypeName ??
    roomTypes.find((type) => type.roomTypeId === data.roomTypeId)?.name;
  const value = (key: Key, data: Snapshot): string => {
    if (!recorded(key, data)) return l.notRecorded;
    switch (key) {
      case "roomTypeId":
        return roomName(data) ?? `#${data.roomTypeId}`;
      case "sportId":
        return data.sportId === null
          ? c.allSports
          : data.sportName
            ? `${data.sportName} (#${data.sportId})`
            : `#${data.sportId}`;
      case "days":
        return data
          .days!.split(",")
          .map((d) => t.operations.weekdays[dayCodes.indexOf(d)])
          .join(", ");
      case "window":
        return `${data.startTimeLocal ?? l.notRecorded}–${data.endTimeLocal ?? l.notRecorded}`;
      case "price":
        return formatMoney(data.price);
      case "active":
        return data.active ? t.wireStatus.ACTIVE : t.wireStatus.INACTIVE;
    }
  };
  if (!Object.keys(before).length && !hasAfter)
    return <p className="small muted">{l.unavailable}</p>;
  const subject = after.roomTypeId !== undefined ? after : before;
  return (
    <div className={styles.root}>
      <p className={styles.subject}>
        <strong>
          {c.rate}: {roomName(subject) ?? `#${row.targetId}`}
        </strong>
      </p>
      {(["roomTypeId", "sportId"] as const)
        .filter(
          (key) =>
            comparison && equal(key, before, after) && recorded(key, after),
        )
        .map((key) => (
          <p className={styles.change} key={key}>
            {labels[key]}: {value(key, after)}
          </p>
        ))}
      {changed.map((key) => (
        <p className={styles.change} key={key}>
          <span>{labels[key]}: </span>
          {comparison ? (
            <>
              <span>
                <span className="sr-only">{l.before}: </span>
                <del>{value(key, before)}</del>
              </span>
              <span aria-hidden="true"> → </span>
              <strong>
                <span className="sr-only">{l.after}: </span>
                {value(key, after)}
              </strong>
            </>
          ) : (
            <span>{value(key, hasAfter ? after : before)}</span>
          )}
        </p>
      ))}
      {comparison && !changed.length && (
        <p className="small muted">{l.unchanged}</p>
      )}
    </div>
  );
}
