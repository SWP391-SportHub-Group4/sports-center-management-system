import { api } from "@/lib/apiClient";
import type { CourtScheduleEntryDto } from "@/lib/types";
export const courtScheduleApi = {
  list: (
    fromDate: string,
    toDate: string,
    roomId: string,
    coach: boolean,
    signal?: AbortSignal,
  ) =>
    api.get<CourtScheduleEntryDto[]>(
      coach ? "/api/coaches/me/court-schedule" : "/api/manager/court-schedule",
      { signal, query: { fromDate, toDate, roomId } },
    ),
};
