import { api } from "@/lib/apiClient";
import type { Paged } from "@/lib/types";

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
};
