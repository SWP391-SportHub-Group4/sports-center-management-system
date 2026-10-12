export type PtTimeSlot = {
  startAtUtc: string;
  endAtUtc: string;
};

/** Returns a stable set of complete 90-minute PT blocks with no overlap. */
export function nonOverlappingPtSlots<T extends PtTimeSlot>(slots: T[]): T[] {
  const sorted = [...slots].sort(
    (a, b) => Date.parse(a.startAtUtc) - Date.parse(b.startAtUtc),
  );
  const result: T[] = [];
  let previousEnd = Number.NEGATIVE_INFINITY;

  for (const slot of sorted) {
    const start = Date.parse(slot.startAtUtc);
    const end = Date.parse(slot.endAtUtc);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end - start !== 90 * 60_000
    ) {
      continue;
    }
    if (start < previousEnd) continue;
    result.push(slot);
    previousEnd = end;
  }

  return result;
}

export function groupPtSlotsByDaypart<T extends PtTimeSlot>(slots: T[]) {
  const groups = [
    { key: "morning", from: 0, to: 12, slots: [] as T[] },
    { key: "afternoon", from: 12, to: 18, slots: [] as T[] },
    { key: "evening", from: 18, to: 24, slots: [] as T[] },
  ];

  for (const slot of nonOverlappingPtSlots(slots)) {
    const hour = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(slot.startAtUtc))
        .find((part) => part.type === "hour")?.value,
    );
    const group = groups.find((item) => hour >= item.from && hour < item.to);
    group?.slots.push(slot);
  }

  return groups.filter((group) => group.slots.length > 0);
}
