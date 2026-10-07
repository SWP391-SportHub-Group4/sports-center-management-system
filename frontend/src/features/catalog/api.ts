import { api } from "@/lib/apiClient";
import type {
  SportDto,
  RoomDto,
  RoomTypeDto,
  CourtRateDto,
  OpeningHourDto,
  RoomBlockDto,
  MembershipPackageDto,
} from "@/lib/types";

export type SaveSport = Pick<
  SportDto,
  "name" | "description" | "imageUrl" | "sortOrder" | "services"
> & { code?: string };
export type SavePackage = Pick<
  MembershipPackageDto,
  "name" | "price" | "durationDays" | "description" | "sessionLimit"
>;
export type SaveRate = Omit<CourtRateDto, "rateId" | "daysOfWeek"> & {
  daysOfWeek: string[];
};
export interface PtPricing {
  pricePerSessionVnd: number;
  priceVersion: string;
}
export const catalogApi = {
  saveSport: (id: number | null, body: SaveSport) =>
    id === null
      ? api.post("/api/manager/sports", body)
      : api.put(`/api/manager/sports/${id}`, body),
  setSportActive: (row: SportDto) =>
    api.post(
      `/api/manager/sports/${row.sportId}/${row.isActive ? "deactivate" : "activate"}`,
    ),
  packages: (signal?: AbortSignal) =>
    api.get<MembershipPackageDto[]>("/api/membership-packages", {
      signal,
      query: { includeInactive: true },
    }),
  savePackage: (id: number | null, body: SavePackage) =>
    id === null
      ? api.post("/api/membership-packages", body)
      : api.put(`/api/membership-packages/${id}`, body),
  setPackageActive: (row: MembershipPackageDto) =>
    api.post(
      `/api/membership-packages/${row.packageId}/${row.isActive ? "discontinue" : "reactivate"}`,
    ),
  ptPricing: (signal?: AbortSignal) =>
    api.get<PtPricing>("/api/pt-pricing", { signal }),
  savePtPrice: (value: string) => api.put("/api/manager/pt-pricing", { value }),
  saveRate: (id: number | null, body: SaveRate) =>
    id === null
      ? api.post("/api/manager/court-rates", body)
      : api.put(`/api/manager/court-rates/${id}`, body),
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
