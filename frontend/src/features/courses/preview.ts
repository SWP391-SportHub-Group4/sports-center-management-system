import { vietnamUtc } from "@/lib/vietnam-time";
import { addDaysIso } from "@/lib/format";
import type { ManagerCourseDto } from "@/lib/types";
export function previewSessions(
  course: Pick<ManagerCourseDto, "startDate" | "numSessions" | "scheduleRules">,
  duration: number,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(course.startDate) ||
    !Number.isInteger(course.numSessions) ||
    course.numSessions < 1 ||
    course.numSessions > 100 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !course.scheduleRules.length ||
    course.scheduleRules.some(
      (r) =>
        !Number.isInteger(r.dayOfWeek) ||
        r.dayOfWeek < 0 ||
        r.dayOfWeek > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTimeLocal),
    )
  )
    return [];
  const weekday = new Date(`${course.startDate}T12:00:00Z`).getUTCDay();
  if (
    !course.scheduleRules.some((r) => r.dayOfWeek === weekday) ||
    new Set(
      course.scheduleRules.map((r) => `${r.dayOfWeek}-${r.startTimeLocal}`),
    ).size !== course.scheduleRules.length
  )
    return [];
  const result: { startAtUtc: string; endAtUtc: string }[] = [];
  for (let day = 0; day < 1400 && result.length < course.numSessions; day++) {
    const date = addDaysIso(course.startDate, day);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const r of course.scheduleRules
      .filter((r) => r.dayOfWeek === weekday)
      .sort((a, b) => a.startTimeLocal.localeCompare(b.startTimeLocal))) {
      const startAtUtc = vietnamUtc(`${date}T${r.startTimeLocal}`);
      result.push({
        startAtUtc,
        endAtUtc: new Date(
          new Date(startAtUtc).getTime() + duration * 60000,
        ).toISOString(),
      });
      if (result.length >= course.numSessions) break;
    }
  }
  return result;
}
