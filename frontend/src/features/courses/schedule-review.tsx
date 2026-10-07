"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { AsyncSection, Table } from "@/components/ui";
import { previewSessions } from "./preview";
import type { ManagerCourseDto } from "@/lib/types";
export type ScheduleDraft = Pick<
  ManagerCourseDto,
  | "startDate"
  | "numSessions"
  | "scheduleRules"
  | "sportId"
  | "defaultRoomId"
  | "coachId"
>;
export async function checkSchedule(
  course: ScheduleDraft,
  minutes: number,
  signal: AbortSignal,
) {
  const slots = previewSessions(course, minutes);
  const rows: Array<(typeof slots)[number] & { available: boolean }> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, slots.length) }, async () => {
      while (next < slots.length) {
        const index = next++;
        const slot = slots[index];
        const [rooms, coaches] = await Promise.all([
          api.get<{ roomId: number }[]>("/api/availability/rooms", {
            signal,
            query: {
              sportId: course.sportId,
              startUtc: slot.startAtUtc,
              endUtc: slot.endAtUtc,
            },
          }),
          course.coachId
            ? api.get<{ coachId: string }[]>("/api/availability/coaches", {
                signal,
                query: {
                  sportId: course.sportId,
                  startUtc: slot.startAtUtc,
                  endUtc: slot.endAtUtc,
                },
              })
            : Promise.resolve([]),
        ]);
        const overlaps = slots.some(
          (other, n) =>
            n !== index &&
            other.startAtUtc < slot.endAtUtc &&
            other.endAtUtc > slot.startAtUtc,
        );
        rows[index] = {
          ...slot,
          available:
            !overlaps &&
            rooms.some((r) => r.roomId === course.defaultRoomId) &&
            (!course.coachId ||
              coaches.some((c) => c.coachId === course.coachId)),
        };
      }
    }),
  );
  return rows;
}
export function ScheduleReview({
  course,
  minutes,
  roomName,
  coachName,
}: {
  course: ScheduleDraft;
  minutes: number;
  roomName?: string;
  coachName?: string | null;
}) {
  const { t } = useLanguage();
  const fingerprint = JSON.stringify(course);
  const state = useApi(
    (signal) => checkSchedule(course, minutes, signal),
    [fingerprint, minutes],
  );
  return (
    <div className="stack">
      <p>{t.managerOperations.previewHint}</p>
      <p>
        {roomName || `#${course.defaultRoomId}`} ·{" "}
        {coachName || t.managerOperations.coachRequired}
      </p>
      <AsyncSection state={state}>
        {(rows) => (
          <>
            <Table
              headers={[
                "#",
                t.operations.start,
                t.operations.end,
                t.operations.status,
              ]}
            >
              {rows.map((r, i) => (
                <tr key={r.startAtUtc}>
                  <td>{i + 1}</td>
                  <td>{formatDateTime(r.startAtUtc)}</td>
                  <td>{formatDateTime(r.endAtUtc)}</td>
                  <td>
                    {r.available
                      ? t.operations.available
                      : t.operations.conflict}
                  </td>
                </tr>
              ))}
            </Table>
            {!rows.length && <p role="alert">{t.operations.invalidSchedule}</p>}
          </>
        )}
      </AsyncSection>
      <button type="button" className="btn btn--ghost" onClick={state.reload}>
        {t.operations.refresh}
      </button>
    </div>
  );
}
