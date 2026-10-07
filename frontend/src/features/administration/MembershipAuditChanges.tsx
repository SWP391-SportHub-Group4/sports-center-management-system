"use client";

import { useLanguage } from "@/lib/language";
import { formatMoney, formatNumber } from "@/lib/format";
import type { AuditLogDto } from "@/lib/types";
import styles from "./MembershipAuditChanges.module.css";

type Snapshot = Partial<{
  name: string;
  price: number;
  durationDays: number;
  sessionLimit: number | null;
  isActive: boolean;
}>;
type Key = keyof Snapshot;
const fields: Key[] = [
  "name",
  "price",
  "durationDays",
  "sessionLimit",
  "isActive",
];

// Membership-specific contract. Never render arbitrary JSON, nested objects or
// sensitive fields, and never infer old prices from the current catalog.
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
    if (typeof data.name === "string") result.name = data.name;
    if (typeof data.price === "number" && Number.isFinite(data.price))
      result.price = data.price;
    if (
      typeof data.durationDays === "number" &&
      Number.isFinite(data.durationDays)
    )
      result.durationDays = data.durationDays;
    if (
      data.sessionLimit === null ||
      (typeof data.sessionLimit === "number" &&
        Number.isFinite(data.sessionLimit))
    )
      result.sessionLimit = data.sessionLimit;
    if (typeof data.isActive === "boolean") result.isActive = data.isActive;
    return result;
  } catch {
    return {};
  }
}

export function MembershipAuditChanges({ row }: { row: AuditLogDto }) {
  const { t } = useLanguage();
  const l = t.auditChanges;
  const before = snapshot(row.oldValue);
  const after = snapshot(row.newValue);
  const hasBefore = Object.keys(before).length > 0;
  const hasAfter = Object.keys(after).length > 0;
  const hasBoth = row.oldValue !== null && row.newValue !== null;
  const changed = fields.filter((key) => {
    if (hasBoth) return before[key] !== after[key];
    // Unlimited sessions is the normal package contract, not useful creation metadata.
    return (
      (hasAfter ? after[key] : before[key]) !== undefined &&
      !(
        key === "sessionLimit" && (hasAfter ? after[key] : before[key]) === null
      )
    );
  });
  const name = after.name ?? before.name;
  const showName = !!name && (!hasBoth || before.name === after.name);
  const labels: Record<Key, string> = {
    name: l.name,
    price: l.price,
    durationDays: l.duration,
    sessionLimit: l.sessionLimit,
    isActive: l.status,
  };
  const value = (key: Key, data: Snapshot): string => {
    const item = data[key];
    if (item === undefined) return l.notRecorded;
    if (key === "price" && typeof item === "number") return formatMoney(item);
    if (key === "durationDays" && typeof item === "number")
      return formatNumber(item) + " " + l.dayUnit;
    if (key === "sessionLimit")
      return item === null ? l.unlimited : formatNumber(item as number);
    if (key === "isActive")
      return item ? t.wireStatus.ACTIVE : t.wireStatus.INACTIVE;
    return String(item);
  };
  if (!hasBefore && !hasAfter)
    return <p className="small muted">{l.unavailable}</p>;
  return (
    <div className={styles.root}>
      {showName && (
        <p className={styles.subject}>
          <strong>
            {l.package}: {name}
          </strong>
        </p>
      )}
      {changed
        .filter((key) => !(key === "name" && showName))
        .map((key) => (
          <p key={key} className={styles.change}>
            <span>{labels[key]}: </span>
            {hasBoth ? (
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
            ) : hasAfter ? (
              <span>{value(key, after)}</span>
            ) : (
              <span>
                <span className="sr-only">{l.before}: </span>
                {value(key, before)}
              </span>
            )}
          </p>
        ))}
      {hasBoth && !changed.length && (
        <p className="small muted">{l.unchanged}</p>
      )}
    </div>
  );
}
