import type { UserAdminDto } from "@/lib/types";
import type { ReportFilters } from "./api";
import {
  monthPeriod,
  validPeriod,
  type PeriodSelection,
} from "./report-periods";

export const reportTabs = [
  "revenue",
  "points",
  "rentals",
  "classes",
  "members",
] as const;
export type ReportTab = (typeof reportTabs)[number];
export const reportLabels: Record<ReportTab, string> = {
  revenue: "Cash",
  points: "Points",
  rentals: "Courts",
  classes: "Classes",
  members: "Gyms",
};
export type FilterScope = "cash" | "points" | "courts" | "classes" | "gyms";
export const tabScope: Record<ReportTab, FilterScope> = {
  revenue: "cash",
  points: "points",
  rentals: "courts",
  classes: "classes",
  members: "gyms",
};
export const filterFields = {
  cash: { sport: true, source: true, member: true },
  points: { sport: false, source: false, member: true },
  courts: { sport: true, source: false, member: true },
  classes: { sport: true, source: false, member: false },
  gyms: { sport: false, source: false, member: false },
};
export interface ReportDimensions {
  sportId: string;
  source: string;
  memberId: string;
  member: UserAdminDto | null;
  sportName?: string;
}
export const blankDimensions = (): ReportDimensions => ({
  sportId: "",
  source: "",
  memberId: "",
  member: null,
});
export function normalizeDimensions(
  scope: FilterScope,
  value: ReportDimensions,
): ReportDimensions {
  const fields = filterFields[scope];
  return {
    sportId: fields.sport ? value.sportId : "",
    sportName: fields.sport ? value.sportName : undefined,
    source: fields.source ? value.source : "",
    memberId: fields.member ? value.memberId : "",
    member: fields.member ? value.member : null,
  };
}
export const sameDimensions = (a: ReportDimensions, b: ReportDimensions) =>
  a.sportId === b.sportId && a.source === b.source && a.memberId === b.memberId;
export const samePeriod = (a: PeriodSelection, b: PeriodSelection) =>
  a.fromDate === b.fromDate &&
  a.toDate === b.toDate &&
  a.compare === b.compare &&
  (a.compare !== "custom" ||
    (a.compareFrom === b.compareFrom && a.compareTo === b.compareTo));
export const countDimensions = (d: ReportDimensions) =>
  [d.sportId, d.source, d.memberId].filter(Boolean).length;
export const asReportFilters = (
  period: PeriodSelection,
  d: ReportDimensions,
): ReportFilters => ({
  fromDate: period.fromDate,
  toDate: period.toDate,
  sportId: d.sportId,
  source: d.source,
  memberId: d.memberId,
});
export const defaultPeriod = (today: string): PeriodSelection => ({
  ...monthPeriod(today),
  compare: "off",
  compareFrom: monthPeriod(today, -1).fromDate,
  compareTo: monthPeriod(today, -1).toDate,
});

export const collectionSources = [
  ["MEMBERSHIP", "Gym & day passes"],
  ["CLASS_PACKAGE", "Classes"],
  ["RENTAL", "Court rental"],
  ["WALLET_TOP_UP", "Wallet top-ups"],
  ["CLASS_TRANSFER_DIFFERENCE", "Class transfer payments"],
  ["RECONCILIATION", "Reconciliation"],
  ["LEGACY_UNCLASSIFIED", "Unclassified (legacy)"],
  ["UNCLASSIFIED", "Unclassified"],
  ["RESERVED_LEGACY_ITEM", "Legacy services"],
] as const;
const sourceKey = (value: string) => value.replaceAll("_", "").toUpperCase();
export const reportSourceName = (source: string) =>
  collectionSources.find(
    ([key]) => sourceKey(key) === sourceKey(source),
  )?.[1] ?? source.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");

export const exportTypeByTab: Record<ReportTab, string> = {
  revenue: "REVENUE_SUMMARY",
  points: "POINTS_SUMMARY",
  rentals: "COURT_RENTAL_REVENUE",
  classes: "CLASS_ENROLLMENT",
  members: "MEMBERSHIP_PERIOD",
};
export const exportScope = (type: string): FilterScope =>
  type === "POINTS_SUMMARY"
    ? "points"
    : type === "COURT_RENTAL_REVENUE"
      ? "courts"
      : type === "CLASS_ENROLLMENT"
        ? "classes"
        : type === "MEMBERSHIP_PERIOD"
          ? "gyms"
          : "cash";
export const tabForScope = (scope: FilterScope): ReportTab =>
  reportTabs.find((tab) => tabScope[tab] === scope)!;
export const reportQueryDefaults = {
  tab: "revenue",
  fromDate: "",
  toDate: "",
  compare: "off",
  compareFrom: "",
  compareTo: "",
  sportId: "",
  source: "",
  memberId: "",
  type: "",
};
export function readReportContext(
  values: Record<string, string>,
  today: string,
) {
  const tab = reportTabs.includes(values.tab as ReportTab)
    ? (values.tab as ReportTab)
    : "revenue";
  const fallback = defaultPeriod(today);
  const period: PeriodSelection = {
    ...(validPeriod({ fromDate: values.fromDate, toDate: values.toDate })
      ? { fromDate: values.fromDate, toDate: values.toDate }
      : fallback),
    compare:
      values.compare === "previous" || values.compare === "custom"
        ? values.compare
        : "off",
    compareFrom: values.compareFrom || fallback.compareFrom,
    compareTo: values.compareTo || fallback.compareTo,
  };
  if (
    period.compare === "custom" &&
    !validPeriod({ fromDate: period.compareFrom, toDate: period.compareTo })
  )
    period.compare = "off";
  const dimensions = normalizeDimensions(tabScope[tab], {
    sportId: /^[1-9]\d*$/.test(values.sportId) ? values.sportId : "",
    source: collectionSources.some(([key]) => key === values.source)
      ? values.source
      : "",
    memberId: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
      values.memberId,
    )
      ? values.memberId
      : "",
    member: null,
  });
  return { tab, period, dimensions, type: values.type || exportTypeByTab[tab] };
}
export function reportContextUrl(
  path: string,
  tab: ReportTab,
  period: PeriodSelection,
  dimensions: ReportDimensions,
  type?: string,
) {
  const d = normalizeDimensions(tabScope[tab], dimensions);
  const params = new URLSearchParams({
    tab,
    fromDate: period.fromDate,
    toDate: period.toDate,
  });
  if (period.compare !== "off") {
    params.set("compare", period.compare);
    if (period.compare === "custom") {
      params.set("compareFrom", period.compareFrom);
      params.set("compareTo", period.compareTo);
    }
  }
  for (const key of ["sportId", "source", "memberId"] as const)
    if (d[key]) params.set(key, d[key]);
  if (type) params.set("type", type);
  return `${path}?${params}`;
}
