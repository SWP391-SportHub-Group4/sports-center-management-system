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
}

export const incidentApi = {
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
