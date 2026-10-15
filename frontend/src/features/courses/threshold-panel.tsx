"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { Card, Field, StatusChip } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { ManagerCourseDto } from "@/lib/types";
export function ThresholdPanel({
  course,
  onSaved,
}: {
  course: ManagerCourseDto;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState(course.price);
  const [costAmount, setCost] = useState(course.costAmount);
  const now = useNow();
  const editable =
    course.status === "PUBLISHED" &&
    !!course.thresholdDeadlineUtc &&
    now < new Date(course.thresholdDeadlineUtc).getTime();
  const threshold = price > 0 ? Math.ceil(costAmount / price) : 0;
  return (
    <Card title={l.threshold}>
      <p>{l.thresholdHint}</p>
      <StatusChip value={course.thresholdStatus} />
      <p>
        {l.confirmed}: {course.confirmedCount} /{" "}
        {course.breakEvenThreshold ?? "—"} · {l.held}: {course.activeHoldCount}{" "}
        · {l.deadline}: {formatDateTime(course.thresholdDeadlineUtc)}
      </p>
      {course.thresholdStatus === "AT_RISK" && course.thresholdResponseDeadlineUtc && (
        <p>Member response deadline: {formatDateTime(course.thresholdResponseDeadlineUtc)}. If the class remains below threshold, decide whether to run it or cancel it before the first session.</p>
      )}
      {course.thresholdStatus === "AT_RISK" && !course.thresholdResponseDeadlineUtc && (
        <div role="alert">
          <p>There is not enough time for a full member response window. Decide now whether to run the class below threshold, cancel it, or move its first session. Members have not been asked to respond.</p>
          <Link href={`/manager/classes/${course.classId}?tab=sessions`}>Move the first session</Link>
          {" · "}
          <Link href={`/manager/classes/${course.classId}?tab=overview#course-cancellation`}>Cancel the course</Link>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutation.run(() =>
              api.put(
                `/api/manager/classes/${course.classId}/threshold/pricing`,
                { price, costAmount, reason },
              ),
            )
          )
            onSaved();
        }}
      >
        <fieldset disabled={mutation.busy}>
          <div className="form-grid">
            <Field label={l.price}>
              <input
                required
                type="number"
                min={1000}
                step={1000}
                disabled={!editable}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </Field>
            <Field label={l.cost}>
              <input
                required
                type="number"
                min={0}
                step={1}
                disabled={!editable}
                value={costAmount}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label={l.reason}>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <p>
            {l.threshold}: {threshold} / {course.capacity}
          </p>
          {threshold > course.capacity && (
            <p role="alert">{t.managerOperations.thresholdExceeded}</p>
          )}
          <div className="btn-row">
            <button
              className="btn"
              disabled={
                mutation.busy ||
                !editable ||
                threshold > course.capacity ||
                reason.trim().length < 3
              }
            >
              {l.save}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              disabled={
                mutation.busy ||
                reason.trim().length < 3 ||
                course.status !== "PUBLISHED" ||
                ["WAIVED_BY_MANAGER", "MET"].includes(course.thresholdStatus)
              }
              onClick={async () => {
                if (
                  await mutation.run(() =>
                    api.post(
                      `/api/manager/classes/${course.classId}/threshold/waive`,
                      { reason },
                    ),
                  )
                )
                  onSaved();
              }}
            >
              {l.waive}
            </button>
          </div>
        </fieldset>
      </form>
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
