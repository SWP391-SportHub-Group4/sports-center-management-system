import { api } from "@/lib/apiClient";
import type { CourseDto, CourseSessionDto, Paged } from "@/lib/types";
export interface LeadCoachCandidates {
  version: number;
  currentCoachId: string | null;
  remainingSessionCount: number;
  coaches: { coachId: string; fullName: string }[];
}
export const courseApi = {
  leadCoachCandidates: (classId: number, signal?: AbortSignal) =>
    api.get<LeadCoachCandidates>(
      `/api/manager/classes/${classId}/lead-coach/candidates`,
      { signal },
    ),
  changeLeadCoach: (
    classId: number,
    body: { coachId: string; expectedVersion: number; reason: string },
  ) => api.post(`/api/manager/classes/${classId}/lead-coach`, body),
  list: (
    query: {
      sportId?: string | number;
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
    },
    signal?: AbortSignal,
  ) =>
    api.get<Paged<CourseDto>>("/api/classes", {
      query,
      signal,
      anonymous: true,
    }),
  detail: (classId: number, signal?: AbortSignal) =>
    api.get<CourseDto>(`/api/classes/${classId}`, { signal, anonymous: true }),
  sessions: (classId: number, mine: boolean, signal?: AbortSignal) =>
    api.get<CourseSessionDto[]>(
      mine
        ? `/api/members/me/classes/${classId}/sessions`
        : `/api/classes/${classId}/public-sessions`,
      { signal, anonymous: !mine },
    ),
};
