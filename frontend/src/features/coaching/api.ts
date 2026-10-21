import { api } from "@/lib/apiClient";
import type {
  CoachMemberRelationshipDto,
  CourseDto,
  CourseSessionDto,
  WorkoutPlanDto,
  Paged,
  CourseRosterDto,
  MemberTrainingProfileDto,
} from "@/lib/types";

export interface AssignedPtStudent {
  memberId: string;
  memberName: string;
  memberEmail: string;
  startedAt: string;
  goal: string | null;
  level: string | null;
  hasTrainingProfile: boolean;
  hasHealthNotes: boolean;
}

export const ptApi = {
  students: (
    page: number,
    search: string,
    health: string,
    signal?: AbortSignal,
  ) =>
    api.get<Paged<AssignedPtStudent>>("/api/coaches/me/students", {
      signal,
      query: { page, search, health },
    }),
  healthProfile: (memberId: string, signal?: AbortSignal) =>
    api.get<{
      trainingProfile: MemberTrainingProfileDto | null;
    }>(`/api/coaches/me/students/${memberId}/health-profile`, { signal }),
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

  plans: (page: number, signal?: AbortSignal, memberId?: string) =>
    api.get<WorkoutPlanDto[]>("/api/coaches/me/workout-plans", {
      signal,
      query: {
        page,
        pageSize: 20,
        memberId,
      },
    }),
};
