import { api } from "@/lib/apiClient";
import type {
  CourtRentalDto,
  CourtRentalPolicyDto,
  CourtRentalDetailDto,
  ExternalCoachProfileDto,
  RentalAvailabilityDto,
} from "@/lib/types";
export const rentalApi = {
  policy: (signal?: AbortSignal) =>
    api.get<CourtRentalPolicyDto>("/api/court-rentals/policy", { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<CourtRentalDetailDto>(`/api/court-rentals/${id}`, { signal }),
  profile: (signal?: AbortSignal) =>
    api.get<ExternalCoachProfileDto>("/api/external-coaches/me", { signal }),
  mine: (fromUtc: string, toUtc: string, signal?: AbortSignal) =>
    api.get<CourtRentalDto[]>("/api/court-rentals/mine", {
      signal,
      query: { fromUtc, toUtc },
    }),
  availability: (
    sportId: number,
    startUtc: string,
    endUtc: string,
    signal?: AbortSignal,
  ) =>
    api.get<RentalAvailabilityDto[]>("/api/court-rentals/availability", {
      signal,
      query: { sportId, startUtc, endUtc },
    }),
  cancel: (id: string) => api.post<void>(`/api/court-rentals/${id}/cancel`),
};
