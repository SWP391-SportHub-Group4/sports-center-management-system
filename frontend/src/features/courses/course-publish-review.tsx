"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card, Table, AsyncSection } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { catalogApi } from "@/features/catalog";
import type { ManagerCourseDto } from "@/lib/types";
import { previewSessions } from "./preview";
export function CoursePublishReview({
  course,
  onSaved,
}: {
  course: ManagerCourseDto;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const preview = useApi(
    async (signal) => {
      const sports = await catalogApi.sports(signal, true);
      const sport = sports.find((s) => s.sportId === course.sportId);
      const minutes = sport?.services.find(
        (s) => s.serviceType === "GROUP_COURSE",
      )?.defaultSessionMinutes;
      if (!minutes) return [];
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
              api.get<{ coachId: string }[]>("/api/availability/coaches", {
                signal,
                query: {
                  sportId: course.sportId,
                  startUtc: slot.startAtUtc,
                  endUtc: slot.endAtUtc,
                },
              }),
            ]);
            rows[index] = {
              ...slot,
              available:
                rooms.some((r) => r.roomId === course.defaultRoomId) &&
                coaches.some((c) => c.coachId === course.coachId),
            };
          }
        }),
      );
      return rows;
    },
    [course.classId, course.version],
  );
  return (
    <Card title={l.publish}>
      <p>{l.publishHint}</p>
      {!course.coachId && (
        <p role="alert">{t.managerOperations.coachRequired}</p>
      )}
      <p>
        {course.numSessions} · {formatMoney(course.price)} · {l.threshold}:{" "}
        {course.breakEvenThreshold ??
          Math.ceil(course.costAmount / course.price)}
      </p>
      <AsyncSection state={preview}>
        {(rows) => (
          <>
            {!rows.length && <p role="alert">{l.invalidSchedule}</p>}
            <Table headers={[l.start, l.end, l.status]}>
              {rows.map((r) => (
                <tr key={r.startAtUtc}>
                  <td>{formatDateTime(r.startAtUtc)}</td>
                  <td>{formatDateTime(r.endAtUtc)}</td>
                  <td>{r.available ? l.available : l.conflict}</td>
                </tr>
              ))}
            </Table>
            <button
              className="btn"
              disabled={
                mutation.busy ||
                !course.coachId ||
                rows.length !== course.numSessions ||
                !rows.every((r) => r.available)
              }
              onClick={async () => {
                if (
                  await mutation.run(() =>
                    api.post(`/api/manager/classes/${course.classId}/publish`, {
                      expectedVersion: course.version,
                    }),
                  )
                )
                  onSaved();
                else preview.reload();
              }}
            >
              {l.confirm}
            </button>
          </>
        )}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
