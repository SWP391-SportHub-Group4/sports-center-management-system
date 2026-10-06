import { api } from "@/lib/apiClient";
import type { CourtScheduleEntryDto, PtSessionDto } from "@/lib/types";
import { dayRange } from "@/lib/vietnam-time";
export const courtScheduleApi = {
  list: async (
    fromDate: string,
    toDate: string,
    roomId: string,
    coach: boolean,
    signal?: AbortSignal,
    includeCoachPt = false,
  ) => {
    const classes = api.get<CourtScheduleEntryDto[]>(
      coach ? "/api/coaches/me/court-schedule" : "/api/manager/court-schedule",
      { signal, query: { fromDate, toDate, roomId } },
    );
    if (!coach || !includeCoachPt) return classes;
    const range = dayRange(fromDate, toDate);
    const ownPt = async () => {
      const sessions: PtSessionDto[] = [];
      for (let page = 1; ; page++) {
        const rows = await api.get<PtSessionDto[]>(
          "/api/coaches/me/pt-sessions",
          {
            signal,
            query: { ...range, page, pageSize: 100 },
          },
        );
        sessions.push(...rows);
        if (rows.length < 100) break;
      }
      return sessions
        .filter((s) => !roomId || String(s.roomId) === roomId)
        .map((s): CourtScheduleEntryDto => ({
          sourceType: "PT_SESSION",
          sourceId: s.sessionId,
          roomId: s.roomId,
          startAtUtc: s.startAtUtc,
          endAtUtc: s.endAtUtc,
          coachId: s.coachId,
          coachName: s.coachName,
          title: s.memberName,
          status: s.status,
          classId: null,
          participants: [
            {
              memberId: s.memberId,
              memberName: s.memberName,
              enrollmentId: null,
              attendanceStatus: null,
              recordedAtUtc: null,
            },
          ],
        }));
    };
    const [groupRows, ptRows] = await Promise.all([classes, ownPt()]);
    return [...groupRows, ...ptRows].sort((a, b) =>
      a.startAtUtc.localeCompare(b.startAtUtc),
    );
  },
};
