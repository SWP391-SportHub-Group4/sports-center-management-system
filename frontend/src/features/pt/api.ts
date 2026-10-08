import { api } from "@/lib/apiClient";
import type {
  CoachMemberRelationshipDto,
  CourseDto,
  CourseSessionDto,
  HomeworkDto,
  PtSessionDto,
  PtEntitlementDto,
  WorkoutPlanDto,
  WorkoutResultDto,
  PtReviewRequestDto,
  Paged,
  ProgressItemDto,
  CourseRosterDto,
  MemberTrainingProfileDto,
} from "@/lib/types";

export const ptApi = {
  sessions: (
    manager: boolean,
    page: number,
    signal?: AbortSignal,
    status?: string,
  ) =>
    api.get<PtSessionDto[]>(
      `/api/${manager ? "manager" : "coaches/me"}/pt-sessions`,
      {
        signal,
        query: {
          page,
          pageSize: 20,
          status,
        },
      },
    ),

  entitlements: (manager: boolean, page: number, signal?: AbortSignal) =>
    api.get<PtEntitlementDto[]>(
      `/api/${manager ? "manager" : "coaches/me"}/pt-entitlements`,
      {
        signal,
        query: {
          page,
          pageSize: 20,
        },
      },
    ),

  relationships: (
    page: number,
    signal?: AbortSignal,
    activeOnly = true,
    memberId?: string,
  ) =>
    api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
      signal,
      query: {
        page,
        pageSize: 20,
        activeOnly,
        memberId,
      },
    }),

  memberProfile: (memberId: string, signal?: AbortSignal) =>
    api.get<MemberTrainingProfileDto | null>(
      `/api/members/${memberId}/training-profile`,
      { signal },
    ),

  classes: (signal?: AbortSignal) =>
    api.get<CourseDto[]>("/api/coaches/me/classes", { signal }),

  classSessions: (id: number, signal?: AbortSignal) =>
    api.get<CourseSessionDto[]>(`/api/classes/${id}/sessions`, { signal }),

  roster: (id: string, signal?: AbortSignal) =>
    api.get<CourseRosterDto>(`/api/class-sessions/${id}/roster`, { signal }),

  results: (page: number, signal?: AbortSignal) =>
    api.get<WorkoutResultDto[]>("/api/coaches/me/workout-results", {
      signal,
      query: {
        page,
        pageSize: 20,
      },
    }),

  progress: (memberId: string, page: number, signal?: AbortSignal) =>
    api.get<Paged<ProgressItemDto>>("/api/coaches/me/progress", {
      signal,
      query: {
        memberId,
        page,
        pageSize: 20,
      },
    }),

  plans: (page: number, signal?: AbortSignal, memberId?: string) =>
    api.get<WorkoutPlanDto[]>("/api/coaches/me/workout-plans", {
      signal,
      query: {
        page,
        pageSize: 20,
        memberId,
      },
    }),

  homework: (page: number, signal?: AbortSignal, memberId?: string) =>
    api.get<HomeworkDto[]>("/api/coaches/me/homework", {
      signal,
      query: {
        page,
        pageSize: 20,
        memberId,
      },
    }),

  requests: (coach: boolean, page: number, signal?: AbortSignal) =>
    api.get<PtReviewRequestDto[]>(
      `/api/manager/pt-${coach ? "coach" : "session"}-change-requests`,
      {
        signal,
        query: {
          page,
          pageSize: 20,
        },
      },
    ),
};
