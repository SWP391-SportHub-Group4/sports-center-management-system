export type ServiceKind = "gym" | "class" | "court" | "pt";
export type EmblemKind =
  "gym" | "pt" | "court" | "badminton" | "basketball" | "whistle";

export const SERVICE_KINDS: readonly ServiceKind[] = [
  "gym",
  "class",
  "court",
  "pt",
];

export const KIND_LABEL: Record<ServiceKind, { vi: string; en: string }> = {
  gym: { vi: "Gym", en: "Gym" },
  class: { vi: "Lớp nhóm", en: "Group class" },
  court: { vi: "Thuê sân", en: "Court rental" },
  pt: { vi: "PT 1-1", en: "PT 1-1" },
};

export const FILTER_LABEL: Record<
  "all" | ServiceKind,
  { vi: string; en: string }
> = {
  all: { vi: "Tất cả", en: "All" },
  gym: { vi: "Gym", en: "Gym" },
  class: { vi: "Lớp", en: "Class" },
  court: { vi: "Sân", en: "Court" },
  pt: { vi: "PT", en: "PT" },
};

export function emblemForSport(
  name: string | null | undefined,
  fallback: EmblemKind = "whistle",
): EmblemKind {
  const value = name ?? "";
  if (/badminton|cầu\s*lông/i.test(value)) return "badminton";
  if (/basketball|bóng\s*rổ/i.test(value)) return "basketball";
  if (/gym|fitness|thể\s*lực/i.test(value)) return "gym";
  return fallback;
}

export function sportLabel(name: string | null | undefined, vi: boolean) {
  const value = name ?? "";
  if (/badminton|cầu\s*lông/i.test(value)) return vi ? "Cầu lông" : "Badminton";
  if (/basketball|bóng\s*rổ/i.test(value)) return vi ? "Bóng rổ" : "Basketball";
  return value;
}

export function monthsOf(days: number) {
  return Math.max(1, Math.round(days / 30.4));
}

/** Cộng tháng lịch như .NET AddMonths: ngày cuối tháng được co lại cho vừa tháng đích. */
export function addMonthsIso(isoDate: string, months: number) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** BR-9: EndDate = StartDate + số tháng - 1 ngày; BR-65: gia hạn sớm bắt đầu ngay sau EndDate đang có. */
export function membershipEnd(startIso: string, months: number) {
  const end = new Date(`${addMonthsIso(startIso, months)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function daysUntil(isoDate: string, nowMs = Date.now()) {
  const end = new Date(`${isoDate.slice(0, 10)}T23:59:59+07:00`).getTime();
  return Math.max(0, Math.ceil((end - nowMs) / 86_400_000));
}
