import { previewSessions } from "./preview";
import { vietnamLocal, oneYearFromToday } from "@/lib/vietnam-time";
import type { ScheduleDraft } from "./schedule-review";

/** Local scheduling rules run before availability and use Vietnam wall time. */
export function scheduleInputIssue(
  course: ScheduleDraft,
  minutes: number,
  now: number,
) {
  if (!course.coachId) return "coach";
  if (!course.defaultRoomId) return "room";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(course.startDate) ||
    !Number.isFinite(Date.parse(`${course.startDate}T00:00:00Z`)) ||
    new Date(`${course.startDate}T00:00:00Z`).toISOString().slice(0, 10) !==
      course.startDate
  )
    return "date";
  if (course.startDate < vietnamLocal(new Date(now).toISOString()).slice(0, 10))
    return "pastDate";
  if (course.startDate > oneYearFromToday(now)) return "futureDate";
  if (
    !Number.isInteger(course.numSessions) ||
    course.numSessions < 1 ||
    course.numSessions > 100
  )
    return "count";
  if (!Number.isFinite(minutes) || minutes <= 0) return "duration";
  if (minutes > 720) return "durationLimit";
  if (!course.scheduleRules.length) return "rules";
  if (
    course.scheduleRules.some(
      (rule) =>
        !Number.isInteger(rule.dayOfWeek) ||
        rule.dayOfWeek < 0 ||
        rule.dayOfWeek > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.startTimeLocal),
    )
  )
    return "time";
  if (
    new Set(
      course.scheduleRules.map(
        (rule) => `${rule.dayOfWeek}-${rule.startTimeLocal}`,
      ),
    ).size !== course.scheduleRules.length
  )
    return "duplicate";
  const weekday = new Date(`${course.startDate}T12:00:00Z`).getUTCDay();
  if (!course.scheduleRules.some((rule) => rule.dayOfWeek === weekday))
    return "weekday";
  const slots = previewSessions(course, minutes);
  if (slots.length !== course.numSessions) return "incomplete";
  if (slots.some((slot) => Date.parse(slot.startAtUtc) <= now))
    return "pastTime";
  if (
    slots.some((slot, index) =>
      slots.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          slot.startAtUtc < other.endAtUtc &&
          slot.endAtUtc > other.startAtUtc,
      ),
    )
  )
    return "overlap";
  return null;
}
