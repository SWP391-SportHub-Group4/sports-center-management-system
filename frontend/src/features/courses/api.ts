import { api } from "@/lib/apiClient";
import type { CourseDto, CourseSessionDto, Paged } from "@/lib/types";
export const courseApi = {
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
