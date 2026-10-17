import { api } from "@/lib/apiClient";
import type { Paged } from "@/lib/types";

export type ClassChangeResolutionType =
  "SUBSTITUTE" | "RESCHEDULE" | "CANCEL_WITH_MAKEUP";
export type ClassChangeType = "ABSENCE" | ClassChangeResolutionType;
export interface ClassChangeOutcome {
  action:
    | ClassChangeResolutionType
    | "ROOM_CHANGED"
    | "COURSE_CANCELLED"
    | "SCHEDULE_UPDATED";
  sessionId: string;
  sessionNo: number;
  startAtUtc: string;
  endAtUtc: string;
  coachId: string;
  coachName: string | null;
  roomId: number;
  roomName: string | null;
  handledBy: string | null;
  reason: string;
  source: "DECISION" | "CURRENT_SCHEDULE";
  sessionStatus: string;
}
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
  resolutionType: ClassChangeResolutionType | "SCHEDULE_UPDATED" | null;
  resultSessionId: string | null;
  outcome?: ClassChangeOutcome | null;
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
  update: (
    id: string,
    body: {
      requestId: string;
      type: ClassChangeType;
      reason: string;
      proposedStartAtUtc: string | null;
      proposedEndAtUtc: string | null;
    },
  ) => api.put<ClassChangeRequest>(`${coachRoot}/change-requests/${id}`, body),
  resolve: (
    id: string,
    body: {
      type: ClassChangeResolutionType;
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
    ABSENCE: vi ? "Yêu cầu vắng" : "Absence",
    SUBSTITUTE: vi ? "Coach dạy thay" : "Substitute coach",
    RESCHEDULE: vi ? "Dời lịch" : "Reschedule",
    CANCEL_WITH_MAKEUP: vi ? "Hủy & học bù" : "Cancel & makeup",
    SCHEDULE_UPDATED: vi ? "Lịch đã được cập nhật" : "Schedule updated",
  })[type] ?? type;
export const coachChangeTypeLabel = changeTypeLabel;
export const changeOutcomeLabel = (action: string, vi: boolean) =>
  ({
    SUBSTITUTE: vi ? "Đã phân công dạy thay" : "Substitute assigned",
    RESCHEDULE: vi ? "Đã dời buổi học" : "Session rescheduled",
    CANCEL_WITH_MAKEUP: vi
      ? "Đã hủy và xếp buổi bù"
      : "Cancelled · makeup scheduled",
    ROOM_CHANGED: vi ? "Đã đổi sân / phòng" : "Court / room changed",
    COURSE_CANCELLED: vi ? "Đã hủy khóa học" : "Class cancelled",
    SCHEDULE_UPDATED: vi ? "Đã cập nhật lịch" : "Schedule updated",
  })[action] ?? (vi ? "Đã xử lý yêu cầu" : "Request processed");
export const changeStatusLabel = (status: string, vi: boolean) =>
  ({
    PENDING: vi ? "Chờ duyệt" : "Pending",
    RESOLVED: vi ? "Đã duyệt" : "Approved",
    REJECTED: vi ? "Từ chối" : "Rejected",
    WITHDRAWN: vi ? "Đã hủy" : "Cancel",
  })[status] ?? status;
export const changeRequestStatusLabel = (
  request: Pick<ClassChangeRequest, "status" | "resolutionType">,
  vi: boolean,
) =>
  request.status === "WITHDRAWN" &&
  request.resolutionType === "SCHEDULE_UPDATED"
    ? vi
      ? "Đã đóng"
      : "Closed"
    : changeStatusLabel(request.status, vi);
