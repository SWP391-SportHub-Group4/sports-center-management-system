import { api } from "@/lib/apiClient";
import type { Paged } from "@/lib/types";

export type ClassChangeType =
  "SUBSTITUTE" | "RESCHEDULE" | "CANCEL_WITH_MAKEUP";
export interface ClassChangeRequest {
  requestId: string;
  sessionId: string;
  classId: number;
  className: string;
  sportId: number;
  sessionNo: number;
  coachId: string;
  coachName: string;
  type: ClassChangeType;
  reason: string;
  status: "PENDING" | "RESOLVED" | "REJECTED" | "WITHDRAWN";
  originalStartAtUtc: string;
  originalEndAtUtc: string;
  originalRoomId: number;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  createdAtUtc: string;
  reviewedAtUtc: string | null;
  reviewNote: string | null;
  resolutionType: ClassChangeType | null;
  resultSessionId: string | null;
}
const coachRoot = "/api/coaches/me/teaching";
const managerRoot = "/api/manager/class-session-change-requests";
export const classChangeApi = {
  list: (
    manager: boolean,
    query: {
      page: number;
      status?: string;
      sessionId?: string;
      classId?: number;
      coachId?: string;
    },
    signal?: AbortSignal,
  ) =>
    api.get<Paged<ClassChangeRequest>>(
      manager ? managerRoot : `${coachRoot}/change-requests`,
      { query, signal },
    ),
  create: (
    sessionId: string,
    body: {
      requestId: string;
      type: ClassChangeType;
      reason: string;
      proposedStartAtUtc: string | null;
      proposedEndAtUtc: string | null;
    },
  ) =>
    api.post<ClassChangeRequest>(
      `${coachRoot}/sessions/${sessionId}/change-requests`,
      body,
    ),
  withdraw: (id: string) =>
    api.post<ClassChangeRequest>(`${coachRoot}/change-requests/${id}/withdraw`),
  resolve: (
    id: string,
    body: {
      type: ClassChangeType;
      reviewNote: string;
      startAtUtc: string | null;
      roomId: number | null;
      coachId: string | null;
    },
  ) => api.post<ClassChangeRequest>(`${managerRoot}/${id}/resolve`, body),
  reject: (id: string, reviewNote: string) =>
    api.post<ClassChangeRequest>(`${managerRoot}/${id}/reject`, { reviewNote }),
};
export const changeTypeLabel = (type: string, vi: boolean) =>
  ({
    SUBSTITUTE: vi ? "Coach dạy thay" : "Substitute coach",
    RESCHEDULE: vi ? "Dời lịch" : "Reschedule",
    CANCEL_WITH_MAKEUP: vi ? "Hủy & học bù" : "Cancel & makeup",
  })[type] ?? type;
export const changeStatusLabel = (status: string, vi: boolean) =>
  ({
    PENDING: vi ? "Chờ xử lý" : "Pending review",
    RESOLVED: vi ? "Đã xử lý" : "Resolved",
    REJECTED: vi ? "Từ chối" : "Rejected",
    WITHDRAWN: vi ? "Đã rút" : "Withdrawn",
  })[status] ?? status;
