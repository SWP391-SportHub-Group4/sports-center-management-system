"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card, Table, AsyncSection } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { catalogApi } from "@/features/catalog";
import type { ManagerCourseDto } from "@/lib/types";
import { checkSchedule } from "./schedule-review";
import { availabilityReason } from "./slot-availability";
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
      return checkSchedule(course, minutes, signal);
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
            <p>
              {rows[0]?.roomName || course.roomName} ·{" "}
              {rows[0]?.coachName || course.coachName}
            </p>
            {!rows.length && <p role="alert">{l.invalidSchedule}</p>}
            <Table headers={[l.start, l.end, l.status]}>
              {rows.map((r) => (
                <tr key={r.startAtUtc}>
                  <td>{formatDateTime(r.startAtUtc)}</td>
                  <td>{formatDateTime(r.endAtUtc)}</td>
                  <td>
                    {r.available ? l.available : l.conflict}
                    {r.reasons.map((reason) => (
                      <p className="small" key={reason}>
                        {availabilityReason(reason, t)}
                      </p>
                    ))}
                  </td>
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
