import { expect, test } from "@playwright/test";
import { scheduleInputIssue } from "../src/features/courses/schedule-validation";
import type { ScheduleDraft } from "../src/features/courses/schedule-review";

const now = Date.parse("2030-10-03T10:00:00Z"); // 17:00 in Vietnam.
const valid: ScheduleDraft = {
  sportId: 3,
  defaultRoomId: 7,
  coachId: "coach",
  capacity: 12,
  startDate: "2030-10-03",
  numSessions: 2,
  scheduleRules: [{ dayOfWeek: 4, startTimeLocal: "18:00" }],
};
const cases: Array<
  [
    string,
    Partial<ScheduleDraft>,
    number,
    ReturnType<typeof scheduleInputIssue>,
  ]
> = [
  [
    "opening date beyond one year",
    { startDate: "2031-10-04" },
    90,
    "futureDate",
  ],
  ["coach required", { coachId: null }, 90, "coach"],
  ["room required", { defaultRoomId: 0 }, 90, "room"],
  ["date required", { startDate: "" }, 90, "date"],
  ["real calendar date required", { startDate: "2030-02-31" }, 90, "date"],
  ["past date", { startDate: "2030-10-02" }, 90, "pastDate"],
  [
    "today past time",
    { scheduleRules: [{ dayOfWeek: 4, startTimeLocal: "16:00" }] },
    90,
    "pastTime",
  ],
  [
    "time equal to now",
    { scheduleRules: [{ dayOfWeek: 4, startTimeLocal: "17:00" }] },
    90,
    "pastTime",
  ],
  ["zero sessions", { numSessions: 0 }, 90, "count"],
  ["over 100 sessions", { numSessions: 101 }, 90, "count"],
  ["fractional session count", { numSessions: 1.5 }, 90, "count"],
  ["missing duration", {}, 0, "duration"],
  ["duration over API limit", {}, 721, "durationLimit"],
  ["no weekly rule", { scheduleRules: [] }, 90, "rules"],
  [
    "missing time",
    { scheduleRules: [{ dayOfWeek: 4, startTimeLocal: "" }] },
    90,
    "time",
  ],
  [
    "invalid weekday",
    { scheduleRules: [{ dayOfWeek: 7, startTimeLocal: "18:00" }] },
    90,
    "time",
  ],
  [
    "duplicate rule",
    {
      scheduleRules: [
        { dayOfWeek: 4, startTimeLocal: "18:00" },
        { dayOfWeek: 4, startTimeLocal: "18:00" },
      ],
    },
    90,
    "duplicate",
  ],
  [
    "weekday does not match start date",
    { scheduleRules: [{ dayOfWeek: 1, startTimeLocal: "18:00" }] },
    90,
    "weekday",
  ],
  [
    "sessions overlap",
    {
      scheduleRules: [
        { dayOfWeek: 4, startTimeLocal: "18:00" },
        { dayOfWeek: 4, startTimeLocal: "18:30" },
      ],
    },
    90,
    "overlap",
  ],
  ["future today is allowed", {}, 90, null],
  [
    "adjacent sessions are allowed",
    {
      scheduleRules: [
        { dayOfWeek: 4, startTimeLocal: "18:00" },
        { dayOfWeek: 4, startTimeLocal: "19:30" },
      ],
    },
    90,
    null,
  ],
];
for (const [name, overrides, minutes, issue] of cases)
  test(name, () =>
    expect(scheduleInputIssue({ ...valid, ...overrides }, minutes, now)).toBe(
      issue,
    ),
  );

test("Vietnam date boundary is independent of browser timezone", () => {
  const midnight = Date.parse("2030-10-02T17:01:00Z");
  expect(
    scheduleInputIssue({ ...valid, startDate: "2030-10-02" }, 90, midnight),
  ).toBe("pastDate");
  expect(scheduleInputIssue(valid, 90, midnight)).toBeNull();
});
