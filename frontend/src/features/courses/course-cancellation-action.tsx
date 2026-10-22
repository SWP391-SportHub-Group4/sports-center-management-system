"use client";

import { CircleAlert, Clock3, LockKeyhole } from "lucide-react";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { ManagerCourseDto } from "@/lib/types";
import type { CancellationPreview } from "./course-operations";
import styles from "./course-management.module.css";

export function CourseCancellationAction({
  course,
  onCancel,
  onViewSchedule,
}: {
  course: ManagerCourseDto;
  onCancel: () => void;
  onViewSchedule: () => void;
}) {
  const { t } = useLanguage();
  const copy = t.classWorkspace;
  const now = useNow(1000);
  const reviewDue =
    !!course.thresholdDeadlineUtc &&
    Date.parse(course.thresholdDeadlineUtc) <= now;
  const preview = useApi(
    (signal) =>
      api.get<CancellationPreview>(
        `/api/manager/classes/${course.classId}/cancellation-preview`,
        { signal },
      ),
    [course.classId, course.version, course.confirmedCount, reviewDue],
  );
  const pending = preview.loading;
  const failed = !pending && (!!preview.error || !preview.data);
  const allowed = !pending && !failed && !!preview.data?.canCancel;
  const refund =
    allowed &&
    !!preview.data?.refundsImmediately &&
    preview.data.confirmedCount > 0;
  const title = pending
    ? copy.checkingCancellation
    : failed
      ? copy.cancellationCheckFailed
      : refund
        ? copy.belowThresholdTitle
        : allowed
          ? copy.cancelClass
          : copy.cancellationUnavailable;
  const reason = preview.data?.blockedReason;
  const message = pending
    ? copy.checkingCancellationHint
    : failed
      ? copy.cancellationRetryHint
      : allowed
        ? refund
          ? copy.cancelBelowThresholdHint
          : copy.cancelClassHint
        : reason === "before_review_deadline"
          ? copy.cancellationBeforeDeadline
          : reason === "session_completed"
            ? copy.cancellationTeachingCompleted
            : reason === "threshold_waived"
              ? copy.cancellationWaived
              : reason === "threshold_met"
                ? copy.cancellationThresholdMet
                : reason === "enrollment_payment_missing"
                  ? copy.cancellationPaymentMissing
                  : copy.enrolledCancellationBlocked;
  const Icon = pending ? Clock3 : refund || failed ? CircleAlert : LockKeyhole;
  return (
    <section
      className={styles.cancellation}
      aria-label={title}
      data-state={
        pending ? "loading" : failed ? "error" : refund ? "eligible" : "neutral"
      }
    >
      <Icon size={22} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p aria-live="polite">{message}</p>
        {!pending && !failed && course.status === "PUBLISHED" && (
          <div className={styles.cancellationFacts}>
            <span>
              <strong>
                {preview.data?.confirmedCount} /{" "}
                {course.breakEvenThreshold ?? "—"}
              </strong>{" "}
              {copy.enrolledLabel}
            </span>
            {course.thresholdDeadlineUtc && (
              <span>
                {copy.cancellationReviewFrom}{" "}
                {formatDateTime(course.thresholdDeadlineUtc)}
              </span>
            )}
          </div>
        )}
      </div>
      {pending ? (
        <span role="status" className={styles.cancellationPending}>
          {t.common.loading}
        </span>
      ) : failed ? (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={preview.reload}
        >
          {t.common.retry}
        </button>
      ) : allowed ? (
        <button type="button" className="btn btn--danger" onClick={onCancel}>
          {refund ? copy.cancelAndRefund : copy.cancelClass}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onViewSchedule}
        >
          {copy.viewSchedule}
        </button>
      )}
    </section>
  );
}
