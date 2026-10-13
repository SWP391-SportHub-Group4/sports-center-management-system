import { api } from "@/lib/apiClient";
import type { Paged, MemberTrainingProfileDto } from "@/lib/types";

export interface TeachingRecord {
  recordId: string;
  classId: number;
  sessionId: string | null;
  memberId: string | null;
  coachId: string;
  kind: "PLAN" | "RESULT" | "NOTICE" | "HOMEWORK";
  title: string;
  content: string;
  score: number | null;
  dueAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  version: number;
}
export interface TeachingMember {
  memberId: string;
  memberName: string;
  email: string;
  goal: string | null;
  experienceLevel: string | null;
  notes: string | null;
  present: number;
  absent: number;
}
export interface StudentClassContext {
  classId: number;
  className: string;
  sportId: number;
  sportName: string;
}
export interface TeachingStudent {
  memberId: string;
  memberName: string;
  email: string;
  classes: StudentClassContext[];
}
export interface StudentAssessmentHistory {
  record: TeachingRecord;
  className: string;
  sportName: string;
  coachName: string;
  sessionNo: number | null;
  sessionStartAtUtc: string | null;
}
export interface StudentHistoryClass {
  classId: number;
  className: string;
  startDate: string;
  assessmentCount: number;
  averageScore: number | null;
  lastRecordedAtUtc: string | null;
  status: string;
  totalSessions: number;
  completedSessions: number;
  presentSessions: number;
  absentSessions: number;
}
export type TeachingWrite = Pick<
  TeachingRecord,
  | "recordId"
  | "kind"
  | "title"
  | "content"
  | "memberId"
  | "sessionId"
  | "score"
  | "dueAtUtc"
  | "version"
>;
const root = "/api/coaches/me/teaching";
export const teachingApi = {
  healthProfile: (memberId: string, signal?: AbortSignal) =>
    api.get<{ profile: MemberTrainingProfileDto | null }>(
      `${root}/students/${memberId}/health-profile`,
      { signal },
    ),
  students: (
    page: number,
    search: string,
    sportId?: number,
    signal?: AbortSignal,
  ) =>
    api.get<
      Paged<TeachingStudent> & {
        sports: { sportId: number; sportName: string }[];
      }
    >(`${root}/students`, { query: { page, search, sportId }, signal }),
  student: (memberId: string, signal?: AbortSignal) =>
    api.get<TeachingStudent>(`${root}/students/${memberId}`, { signal }),
  studentHistory: (
    memberId: string,
    classId: number,
    page: number,
    signal?: AbortSignal,
    sourceClassId?: number,
  ) =>
    api.get<Paged<StudentAssessmentHistory>>(
      `${root}/students/${memberId}/history`,
      { query: { classId, page, sourceClassId }, signal },
    ),
  studentHistoryClasses: (
    memberId: string,
    classId: number,
    page: number,
    search: string,
    signal?: AbortSignal,
  ) =>
    api.get<Paged<StudentHistoryClass>>(
      `${root}/students/${memberId}/history/classes`,
      { query: { classId, page, search }, signal },
    ),
  members: (classId: number, signal?: AbortSignal, memberId?: string) =>
    api.get<TeachingMember[]>(`${root}/classes/${classId}/members`, {
      signal,
      query: { memberId },
    }),
  records: async (
    classId: number,
    signal?: AbortSignal,
    member = false,
    memberId?: string,
  ) => {
    const path = member
      ? `/api/members/me/classes/${classId}/teaching-records`
      : `${root}/classes/${classId}/records`;
    const result: TeachingRecord[] = [];
    for (let page = 1; ; page++) {
      const data = await api.get<Paged<TeachingRecord>>(path, {
        signal,
        query: { page, ...(member ? {} : { memberId }) },
      });
      result.push(...data.items);
      if (result.length >= data.totalCount || data.items.length === 0)
        return result;
    }
  },
  save: (classId: number, body: TeachingWrite, update: boolean) =>
    update
      ? api.put<TeachingRecord>(
          `${root}/classes/${classId}/records/${body.recordId}`,
          body,
        )
      : api.post<TeachingRecord>(`${root}/classes/${classId}/records`, body),
  attendance: (sessionId: string, enrollmentId: string, status: string) =>
    api.put(`${root}/sessions/${sessionId}/attendance/${enrollmentId}`, {
      status,
    }),
  suggest: (
    classId: number,
    memberId: string | null,
    goal: string,
    level: string,
    language: string,
    scope: "course" | "session" | "personal" = "session",
    sessionId: string | null = null,
  ) =>
    api.post<{ content: string; provider: string; model: string }>(
      `${root}/classes/${classId}/suggestion`,
      { memberId, goal, level, language, scope, sessionId },
    ),
};
