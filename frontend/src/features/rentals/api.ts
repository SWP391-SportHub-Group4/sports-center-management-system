import { api } from "@/lib/apiClient";
import type {
  CourtRentalDto,
  CourtRentalPolicyDto,
  CourtRentalDetailDto,
  RentalAvailabilityDto,
} from "@/lib/types";
export interface CourtCalendarSlot {
  startUtc: string;
  endUtc: string;
  status:
    | "AVAILABLE"
    | "BOOKED"
    | "HELD"
    | "BLOCKED"
    | "SCHEDULED"
    | "UNAVAILABLE"
    | "NO_RATE";
  totalPrice: number | null;
  blocks: RentalAvailabilityDto["blocks"];
}
export interface CourtCalendarDay {
  sportId: number;
  date: string;
  serverNowUtc: string;
  rooms: { roomId: number; name: string; slots: CourtCalendarSlot[] }[];
}
export const rentalApi = {
  calendar: (
    sportId: number,
    date: string,
    hours: number,
    signal?: AbortSignal,
  ) =>
    api.get<CourtCalendarDay>("/api/court-rentals/calendar", {
      signal,
      query: { sportId, date, hours },
    }),
  policy: (signal?: AbortSignal) =>
    api.get<CourtRentalPolicyDto>("/api/court-rentals/policy", { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<CourtRentalDetailDto>(`/api/court-rentals/${id}`, { signal }),
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
