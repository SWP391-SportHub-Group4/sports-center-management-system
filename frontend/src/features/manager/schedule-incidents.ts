import type { CourtScheduleEntryDto } from "@/lib/types";

export function groupCenterIncidents(entries: CourtScheduleEntryDto[]) {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (
      entry.sourceType !== "ROOM_BLOCK" ||
      entry.incidentScope !== "CENTER" ||
      !entry.incidentId
    )
      return [entry];
    const key = `${entry.incidentId}-${entry.startAtUtc}-${entry.endAtUtc}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...entry, sourceId: entry.incidentId, roomId: null }];
  });
}
