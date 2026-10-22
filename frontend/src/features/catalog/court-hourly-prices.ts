import type { CourtRateDto, RoomDto } from "@/lib/types";

/** Summarize effective weekly prices, respecting court-specific overrides of shared rates. */
export function courtHourlyPrices(
  room: RoomDto,
  rates: CourtRateDto[],
  legacySportId?: number,
): number[] {
  const sportId = room.sportId ?? legacySportId;
  const applicable = rates.filter(
    (rate) =>
      rate.isActive &&
      rate.roomTypeId === room.roomTypeId &&
      (rate.roomId == null || rate.roomId === room.roomId) &&
      (rate.sportId == null || rate.sportId === sportId),
  );
  const prices = new Set<number>();
  for (const day of ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]) {
    const daily = applicable.filter((rate) =>
      rate.daysOfWeek.split(",").includes(day),
    );
    const boundaries = [
      ...new Set(
        daily.flatMap((rate) => [
          rate.startTimeLocal.slice(0, 5),
          rate.endTimeLocal.slice(0, 5),
        ]),
      ),
    ].sort();
    for (let i = 0; i < boundaries.length - 1; i++) {
      const matching = daily.filter(
        (rate) =>
          rate.startTimeLocal.slice(0, 5) <= boundaries[i] &&
          rate.endTimeLocal.slice(0, 5) >= boundaries[i + 1],
      );
      const effective =
        matching.find((rate) => rate.roomId === room.roomId) ??
        matching.find((rate) => rate.roomId == null);
      if (effective) prices.add(effective.pricePerHour);
    }
  }
  return [...prices].sort((a, b) => a - b);
}
