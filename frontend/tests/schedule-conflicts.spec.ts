import { expect, test } from "@playwright/test";
import {
  draftScheduleConflictFlags,
  scheduleConflictFlags,
} from "../src/features/courses/schedule-conflicts";
import type { CourtScheduleEntryDto } from "../src/lib/types";

const draft = {
  startAtUtc: "2032-11-01T00:00:00.000Z",
  endAtUtc: "2032-11-01T02:00:00.000Z",
};
const booking: CourtScheduleEntryDto = {
  sourceType: "COURT_RENTAL",
  sourceId: "rental",
  roomId: 7,
  startAtUtc: "2032-10-31T23:00:00Z",
  endAtUtc: "2032-11-01T00:00:00Z",
  coachId: null,
  coachName: null,
  title: "Court rental",
  status: "CONFIRMED",
  classId: null,
  participants: [],
};

for (const [name, changes, expected] of [
  ["adjacent booking ends at draft start without milliseconds", {}, false],
  [
    "adjacent booking starts at draft end",
    { startAtUtc: "2032-11-01T02:00:00Z", endAtUtc: "2032-11-01T03:00:00Z" },
    false,
  ],
  [
    "same adjacent instant expressed in Vietnam timezone",
    {
      startAtUtc: "2032-11-01T06:00:00+07:00",
      endAtUtc: "2032-11-01T07:00:00+07:00",
    },
    false,
  ],
  ["one millisecond overlap", { endAtUtc: "2032-11-01T00:00:00.001Z" }, true],
  ["real overlap", { endAtUtc: "2032-11-01T01:00:00Z" }, true],
  [
    "cancelled overlapping booking",
    { endAtUtc: "2032-11-01T01:00:00Z", status: "CANCELLED" },
    false,
  ],
  ["unrelated room", { roomId: 8, endAtUtc: "2032-11-01T01:00:00Z" }, false],
  [
    "same coach in another room",
    { roomId: 8, coachId: "coach", endAtUtc: "2032-11-01T01:00:00Z" },
    true,
  ],
] satisfies [string, Partial<CourtScheduleEntryDto>, boolean][]) {
  test(name, () => {
    const entries = [{ ...booking, ...changes }];
    expect(draftScheduleConflictFlags(entries, [draft], "coach", 7)).toEqual([
      expected,
    ]);
    expect(scheduleConflictFlags(entries, [draft], "coach", 7)).toEqual([
      expected,
    ]);
  });
}

test("adjacent boundary also works when only the booking has milliseconds", () => {
  expect(
    draftScheduleConflictFlags(
      [{ ...booking, endAtUtc: "2032-11-01T00:00:00.000Z" }],
      [{ ...draft, startAtUtc: "2032-11-01T00:00:00Z" }],
      "coach",
      7,
    ),
  ).toEqual([false]);
});
