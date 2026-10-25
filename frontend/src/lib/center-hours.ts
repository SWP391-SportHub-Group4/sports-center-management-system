import { api, ApiError } from "./apiClient";
import type { SystemSettingDto } from "./types";

export const centerOpeningKey = "center.opening_minutes";
export const centerClosingKey = "center.closing_minutes";
export const minutesToTime = (value: number) =>
  Number.isFinite(value)
    ? `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
    : "";
export const timeToMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour < 24 && minute < 60 ? hour * 60 + minute : NaN;
};
export interface CenterHours {
  openingMinute: number;
  closingMinute: number;
  opens: string;
  closes: string;
}
export async function loadCenterHours(
  signal?: AbortSignal,
): Promise<CenterHours> {
  const rows = await api.get<SystemSettingDto[]>("/api/system-settings", {
    signal,
  });
  const opening = rows.find((row) => row.key === centerOpeningKey);
  const closing = rows.find((row) => row.key === centerClosingKey);
  const openingMinute = Number(opening?.value),
    closingMinute = Number(closing?.value);
  if (
    !opening ||
    !closing ||
    !Number.isInteger(openingMinute) ||
    !Number.isInteger(closingMinute) ||
    openingMinute < 0 ||
    closingMinute > 1439 ||
    openingMinute >= closingMinute
  )
    throw new ApiError(
      0,
      "invalid_center_hours",
      "Center opening hours are unavailable. Check Settings and try again.",
    );
  return {
    openingMinute,
    closingMinute,
    opens: minutesToTime(openingMinute),
    closes: minutesToTime(closingMinute),
  };
}
export const centerHoursHint = (hours: CenterHours) =>
  `Center opening hours: ${hours.opens}–${hours.closes} (Vietnam time).`;
export const centerHoursError = (hours: CenterHours) =>
  `Outside center opening hours (${hours.opens}–${hours.closes}, Vietnam time). Choose a time range that starts and ends within these hours.`;
