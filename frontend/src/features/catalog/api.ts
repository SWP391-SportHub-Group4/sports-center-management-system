import { api } from "@/lib/apiClient";
import type {
  SportDto,
  RoomDto,
  RoomTypeDto,
  CourtRateDto,
  OpeningHourDto,
  RoomBlockDto,
} from "@/lib/types";
export const catalogApi = {
  sports: (signal?: AbortSignal, manager = false) =>
    api.get<SportDto[]>(manager ? "/api/manager/sports" : "/api/sports", {
      signal,
    }),
  rooms: (signal?: AbortSignal) => api.get<RoomDto[]>("/api/rooms", { signal }),
  roomTypes: (signal?: AbortSignal) =>
    api.get<RoomTypeDto[]>("/api/room-types", { signal }),
  rates: (signal?: AbortSignal) =>
    api.get<CourtRateDto[]>("/api/manager/court-rates", { signal }),
  hours: (roomId: number, signal?: AbortSignal) =>
    api.get<OpeningHourDto[]>(`/api/rooms/${roomId}/opening-hours`, { signal }),
  blocks: (
    roomId: number,
    fromUtc: string,
    toUtc: string,
    signal?: AbortSignal,
  ) =>
    api.get<RoomBlockDto[]>("/api/manager/room-blocks", {
      signal,
      query: { roomId, fromUtc, toUtc },
    }),
};
