import { api } from "@/lib/apiClient";
import type { IncidentPreviewDto, Paged } from "@/lib/types";

export interface IncidentRequest {
  scope: string;
  roomId: number | null;
  startAtUtc: string;
  endAtUtc: string;
  reason: string;
  membershipExtensionDays?: number;
}

export interface IncidentDelivery {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  read: number;
}

export interface IncidentDetails {
  incidentId: string;
  scope: string;
  roomId: number | null;
  roomName: string | null;
  startAtUtc: string;
  endAtUtc: string;
  reason: string;
  resolutionSummary: string;
  createdAtUtc: string;
  sessionReports?:
    | {
        sessionId: string;
        classId: number;
        sessionNo: number;
        className: string;
        report: {
          outcome: string;
          occurredAtUtc: string;
          recordedAtUtc: string;
          reason: string;
          replacementSessionId: string | null;
        };
      }[]
    | null;
}

export interface IncidentFence {
  fenceId: string;
  scope: string;
  roomId: number | null;
  roomName: string | null;
  startAtUtc: string;
  endAtUtc: string;
  reason: string;
  createdAtUtc: string;
  expiresAtUtc: string;
  /** The hold lapsed (or the window passed): bookings are allowed again until it is extended. */
  isExpired: boolean;
  remainingImpacts: number;
  affectedMemberCount: number;
  canResolve: boolean;
  /** Schedule changes made while this window was held; abandoning can put them back. */
  appliedSteps: number;
}

export interface IncidentFenceStep {
  stepId: string;
  kind: "RESCHEDULE" | "CANCEL_WITH_MAKEUP" | "REMOVE_ROOM_BLOCK" | "REVIEWED_COMPLETED";
  className: string;
  sessionNo: number;
  beforeStartUtc: string;
  afterStartUtc: string;
  state: "APPLIED" | "UNDONE" | "UNDO_FAILED";
  undoNote: string | null;
  canUndo: boolean;
}

export interface IncidentAbandonResult {
  fenceId: string;
  undone: number;
  notUndone: IncidentFenceStep[];
}

export const incidentApi = {
  openFence: (request: IncidentRequest) =>
    api.post<IncidentFence>("/api/manager/incidents/fences", request),
  fences: (signal?: AbortSignal) =>
    api.get<IncidentFence[]>("/api/manager/incidents/fences", { signal }),
  extendFence: (id: string) =>
    api.post<IncidentFence>(`/api/manager/incidents/fences/${id}/extend`),
  fenceSteps: (id: string, signal?: AbortSignal) =>
    api.get<IncidentFenceStep[]>(`/api/manager/incidents/fences/${id}/steps`, {
      signal,
    }),
  abandonFence: (id: string) =>
    api.post<IncidentAbandonResult>(
      `/api/manager/incidents/fences/${id}/abandon`,
    ),
  releaseFence: (id: string) =>
    api.post(`/api/manager/incidents/fences/${id}/release`),
  list: (page: number, signal?: AbortSignal) =>
    api.get<Paged<IncidentDetails>>("/api/manager/incidents", {
      signal,
      query: { page, pageSize: 20 },
    }),
  get: (id: string, signal?: AbortSignal) =>
    api.get<IncidentDetails>(`/api/manager/incidents/${id}`, { signal }),
  preview: (request: IncidentRequest) =>
    api.post<IncidentPreviewDto>("/api/manager/incidents/preview", request),
  resolve: (request: IncidentRequest) =>
    api.post<{ incidentId: string }>("/api/manager/incidents/resolve", request),
  notifications: (id: string, signal?: AbortSignal) =>
    api.get<IncidentDelivery>(`/api/manager/incidents/${id}/notifications`, {
      signal,
    }),
};
