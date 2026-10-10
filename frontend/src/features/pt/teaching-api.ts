import { api } from "@/lib/apiClient";
import type { Paged } from "@/lib/types";

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
  members: (classId: number, signal?: AbortSignal) =>
    api.get<TeachingMember[]>(`${root}/classes/${classId}/members`, { signal }),
  records: async (classId: number, signal?: AbortSignal, member = false) => {
    const path = member
      ? `/api/members/me/classes/${classId}/teaching-records`
      : `${root}/classes/${classId}/records`;
    const result: TeachingRecord[] = [];
    for (let page = 1; ; page++) {
      const data = await api.get<Paged<TeachingRecord>>(path, {
        signal,
        query: { page },
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
