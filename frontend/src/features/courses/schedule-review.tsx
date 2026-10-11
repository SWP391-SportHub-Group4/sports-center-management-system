"use client";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { AsyncSection, Table } from "@/components/ui";
import { previewSessions } from "./preview";
import type { ManagerCourseDto } from "@/lib/types";
import {
  checkClassSlot,
  availabilityReason,
  type ClassSlotAvailability,
} from "./slot-availability";
export type ScheduleDraft = Pick<
  ManagerCourseDto,
  | "startDate"
  | "numSessions"
  | "scheduleRules"
  | "sportId"
  | "defaultRoomId"
  | "coachId"
  | "capacity"
>;
export async function checkSchedule(
  course: ScheduleDraft,
  minutes: number,
  signal: AbortSignal,
) {
  const slots = previewSessions(course, minutes);
  const rows: Array<(typeof slots)[number] & ClassSlotAvailability> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, slots.length) }, async () => {
      while (next < slots.length) {
        const index = next++;
        const slot = slots[index];
        const result = await checkClassSlot(
          {
            sportId: course.sportId,
            roomId: course.defaultRoomId,
            coachId: course.coachId,
            capacity: course.capacity,
            startUtc: slot.startAtUtc,
            endUtc: slot.endAtUtc,
          },
          signal,
        );
        const overlaps = slots.some(
          (other, n) =>
            n !== index &&
            other.startAtUtc < slot.endAtUtc &&
            other.endAtUtc > slot.startAtUtc,
        );
        rows[index] = {
          ...slot,
          ...result,
          available: !overlaps && result.available,
          reasons: [...result.reasons, ...(overlaps ? ["draft_overlap"] : [])],
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
      <AsyncSection state={state}>
        {(rows) => (
          <>
            <p>
              {rows[0]?.roomName || roomName || `#${course.defaultRoomId}`} ·{" "}
              {rows[0]?.coachName ||
                coachName ||
                t.managerOperations.coachRequired}
            </p>
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
                    {r.reasons.map((reason) => (
                      <p className="small" key={reason}>
                        {availabilityReason(reason, t)}
                      </p>
                    ))}
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
