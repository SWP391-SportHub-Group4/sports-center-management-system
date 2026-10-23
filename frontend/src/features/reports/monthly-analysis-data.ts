import type { ClassEnrollmentReportDto, RevenueReportDto } from "@/lib/types";

export function currentCourseRows(report: ClassEnrollmentReportDto) {
  return report.classes.filter(
    (row) => !["CANCELLED", "DRAFT"].includes(row.status.toUpperCase()),
  );
}

export function occupancyBySport(rows: ClassEnrollmentReportDto["classes"]) {
  const groups = new Map<
    number,
    {
      id: number;
      name: string;
      capacity: number;
      confirmed: number;
      classes: number;
    }
  >();
  for (const row of rows) {
    const group = groups.get(row.sportId) ?? {
      id: row.sportId,
      name: row.sportName,
      capacity: 0,
      confirmed: 0,
      classes: 0,
    };
    group.capacity += row.capacity;
    group.confirmed += row.confirmedCount;
    group.classes++;
    groups.set(row.sportId, group);
  }
  return Array.from(groups.values(), (row) => ({
    ...row,
    ratio: row.capacity > 0 ? row.confirmed / row.capacity : null,
  })).sort(
    (a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || a.name.localeCompare(b.name),
  );
}

function sourceLabel(source: string) {
  const normalized = source.replaceAll("_", "").toUpperCase();
  if (normalized.includes("MEMBERSHIP")) return "Gym";
  if (normalized.includes("CLASS")) return "Classes";
  if (normalized.includes("RENTAL")) return "Court rental";
  if (normalized === "WALLETTOPUP") return "Wallet top-ups";
  if (normalized.includes("RECONCILIATION")) return "Reconciliation";
  return "Other collections";
}

export function collectionSources(
  report: Pick<
    RevenueReportDto,
    "bySource" | "reconciliationCashCollected" | "totalCollected"
  >,
) {
  const groups = new Map<string, number>();
  for (const row of report.bySource ?? []) {
    const label = sourceLabel(row.source);
    groups.set(label, (groups.get(label) ?? 0) + row.cashCollected);
  }
  // Modern responses already include reconciliation in bySource. Only supplement missing cash.
  const missingReconciliation = Math.max(
    0,
    report.reconciliationCashCollected - (groups.get("Reconciliation") ?? 0),
  );
  if (missingReconciliation > 0)
    groups.set(
      "Reconciliation",
      (groups.get("Reconciliation") ?? 0) + missingReconciliation,
    );
  const allocated = Array.from(groups.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  const remainder = report.totalCollected - allocated;
  if (remainder > 0.01)
    groups.set(
      "Other collections",
      (groups.get("Other collections") ?? 0) + remainder,
    );
  return {
    mismatch:
      remainder < -0.01 ||
      Array.from(groups.values()).some((amount) => amount < 0),
    sources: Array.from(groups, ([label, amount]) => ({
      label,
      amount,
      share: report.totalCollected > 0 ? amount / report.totalCollected : 0,
    }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
  };
}

export const compactAmount = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(amount)
    .toUpperCase();
