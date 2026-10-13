import { api } from "@/lib/apiClient";
import { addDaysIso } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import type {
  CourseEnrollmentDto,
  CourseMemberSessionDto,
  Paged,
} from "@/lib/types";
import type { CalendarEvent } from "@/components/scheduling";

export interface MemberEvent extends CalendarEvent {
  classId?: number;
  sportName?: string | null;
  attendanceStatus?: string | null;
  isMakeup?: boolean;
  quotaState?: string;
}

export async function memberSchedule(
  date: string,
  days: number,
  signal: AbortSignal,
): Promise<MemberEvent[]> {
  const query = {
    fromUtc: new Date(`${date}T00:00:00+07:00`).toISOString(),
    toUtc: new Date(`${addDaysIso(date, days)}T00:00:00+07:00`).toISOString(),
  };
  const classes = await api.get<CourseMemberSessionDto[]>(
    "/api/members/me/schedule",
    { signal, query },
  );
  return [
    ...classes.map((s): MemberEvent => ({
      ...s,
      id: `class:${s.sessionId}`,
      title: s.className,
      type: "CLASS_SESSION",
    })),
  ].sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
}

// The enrollment endpoint is paged; filtering tabs and resolving a deep link must
// include every page, not just the first ten purchases.
export async function memberEnrollments(signal: AbortSignal) {
  const rows: CourseEnrollmentDto[] = [];
  for (let page = 1; ; page++) {
    const result = await api.get<Paged<CourseEnrollmentDto>>(
      "/api/members/me/enrollments",
      { signal, query: { page, pageSize: 50 } },
    );
    const batch = pagedItems(result);
    rows.push(...batch);
    if (!batch.length || rows.length >= result.totalCount || batch.length < 50)
      return rows;
  }
}
