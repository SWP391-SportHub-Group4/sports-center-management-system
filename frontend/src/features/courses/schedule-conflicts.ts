import type { CourtScheduleEntryDto } from "@/lib/types";

type Slot = { startAtUtc: string; endAtUtc: string };
const overlaps = (a: Slot, b: Slot) =>
  Date.parse(a.startAtUtc) < Date.parse(b.endAtUtc) &&
  Date.parse(b.startAtUtc) < Date.parse(a.endAtUtc);
const active = (entry: CourtScheduleEntryDto) =>
  !/^(CANCELLED|CANCELED|CANCELLEDLATE|CANCELEDLATE|RESCHEDULED|EXPIRED|VOID)$/i.test(
    entry.status.replaceAll("_", ""),
  );
const roomsOf = (entry: CourtScheduleEntryDto) => [
  ...(entry.affectedRoomIds ?? []),
  ...(entry.roomId ? [entry.roomId] : []),
];
const sameResource = (a: CourtScheduleEntryDto, b: CourtScheduleEntryDto) =>
  a.incidentScope === "CENTER" ||
  b.incidentScope === "CENTER" ||
  (!!a.coachId && a.coachId === b.coachId) ||
  roomsOf(a).some((room) => roomsOf(b).includes(room));
const matchesResource = (
  entry: CourtScheduleEntryDto,
  coachId: string,
  roomId: number,
) =>
  entry.incidentScope === "CENTER" ||
  (!!coachId && entry.coachId === coachId) ||
  (!!roomId && roomsOf(entry).includes(roomId));

export function draftScheduleConflictFlags(
  entries: CourtScheduleEntryDto[],
  draft: Slot[],
  coachId: string,
  roomId: number,
): boolean[] {
  return draft.map((slot) =>
    entries.some(
      (entry) =>
        active(entry) &&
        matchesResource(entry, coachId, roomId) &&
        overlaps(entry, slot),
    ),
  );
}

export function scheduleConflictFlags(
  entries: CourtScheduleEntryDto[],
  draft: Slot[],
  coachId: string,
  roomId: number,
): boolean[] {
  return entries.map(
    (entry, index) =>
      active(entry) &&
      ((matchesResource(entry, coachId, roomId) &&
        draft.some((slot) => overlaps(entry, slot))) ||
        entries.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            active(other) &&
            sameResource(entry, other) &&
            overlaps(entry, other),
        )),
  );
}
