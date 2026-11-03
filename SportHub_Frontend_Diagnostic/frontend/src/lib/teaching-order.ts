import type { CourseDto, CourseSessionDto } from "./types";

export function isPastSession(
  session: Pick<CourseSessionDto, "status" | "endAtUtc">,
  now: number,
) {
  return (
    /completed|cancelled/i.test(session.status) ||
    Date.parse(session.endAtUtc) <= now
  );
}

/** Current/upcoming sessions start soonest first; historical sessions show the most recent first. */
export function sortTeachingSessions(
  sessions: CourseSessionDto[],
  now: number,
) {
  return [...sessions].sort((a, b) => {
    const pastA = isPastSession(a, now),
      pastB = isPastSession(b, now);
    return (
      Number(pastA) - Number(pastB) ||
      (Date.parse(a.startAtUtc) - Date.parse(b.startAtUtc)) *
        (pastA ? -1 : 1) ||
      a.sessionNo - b.sessionNo ||
      a.sessionId.localeCompare(b.sessionId)
    );
  });
}

export function sortTeachingClasses(
  classes: CourseDto[],
  sessions: CourseSessionDto[],
  now: number,
) {
  const context = (course: CourseDto) => {
    const own = sessions.filter((s) => s.classId === course.classId);
    const next = sortTeachingSessions(
      own.filter((s) => !isPastSession(s, now)),
      now,
    )[0];
    const terminal = /completed|cancelled/i.test(course.status);
    const start = Date.parse(`${course.startDate}T00:00:00+07:00`);
    return {
      past: terminal || (!next && (own.length > 0 || start < now)),
      at: next
        ? Date.parse(next.startAtUtc)
        : own.length
          ? Math.max(...own.map((s) => Date.parse(s.endAtUtc)))
          : start,
    };
  };
  const keys = new Map(
    classes.map((course) => [course.classId, context(course)]),
  );
  return [...classes].sort((a, b) => {
    const x = keys.get(a.classId)!,
      y = keys.get(b.classId)!;
    return (
      Number(x.past) - Number(y.past) ||
      (x.at - y.at) * (x.past ? -1 : 1) ||
      a.name.localeCompare(b.name) ||
      a.classId - b.classId
    );
  });
}
