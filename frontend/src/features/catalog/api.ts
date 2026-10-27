import { api } from "@/lib/apiClient";
import { notifySportCatalogChanged } from "@/lib/sport-catalog-events";
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
  "name" | "description" | "imageUrl" | "services"
> & {
  code?: string;
  createRoomType?: boolean;
  roomTypeName?: string;
  isActive?: boolean;
};
export type SavePackage = Pick<
  MembershipPackageDto,
  "name" | "price" | "durationDays" | "description" | "sessionLimit"
> & { isActive?: boolean };
export type SaveRate = Omit<CourtRateDto, "rateId" | "daysOfWeek"> & {
  daysOfWeek: string[];
};
export const catalogApi = {
  sportDeactivationImpact: (id: number, signal?: AbortSignal) =>
    api.get<
      { classId: number; code: string; name: string; confirmedCount: number }[]
    >(`/api/manager/sports/${id}/deactivation-impact`, { signal }),
  setRoomRental: (roomId: number, allowRental: boolean) =>
    api.put<RoomDto>(`/api/rooms/${roomId}/rental-access`, { allowRental }),
  deleteRoom: (id: number) => api.del(`/api/rooms/${id}`),
  deleteRoomType: (id: number) => api.del(`/api/manager/room-types/${id}`),
  deleteRate: (id: number) => api.del(`/api/manager/court-rates/${id}`),
  saveSport: async (id: number | null, body: SaveSport) => {
    const result = await (id === null
      ? api.post<SportDto>("/api/manager/sports", body)
      : api.put<SportDto>(`/api/manager/sports/${id}`, body));
    notifySportCatalogChanged();
    return result;
  },
  setSportActive: async (row: SportDto) => {
    const result = await api.post<SportDto>(
      `/api/manager/sports/${row.sportId}/${row.isActive ? "deactivate" : "activate"}`,
    );
    notifySportCatalogChanged();
    return result;
  },
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
  upcomingBlocks: (roomId: number, signal?: AbortSignal) =>
    api.get<RoomBlockDto[]>("/api/manager/room-blocks", {
      signal,
      query: { roomId },
    }),
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
