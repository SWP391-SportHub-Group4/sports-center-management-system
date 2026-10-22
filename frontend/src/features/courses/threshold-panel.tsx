"use client";
import { CourseCancellation } from "./course-operations";
import styles from "./course-management.module.css";
import { createPortal } from "react-dom";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card, Field, StatusChip, Dialog } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { ManagerCourseDto } from "@/lib/types";
export function ThresholdPanel({
  course,
  onSaved,
}: {
  course: ManagerCourseDto;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const l = t.operations;
  const mutation = useMutation();
  const [action, setAction] = useState<"pricing" | "waive" | null>(null);
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState(course.price);
  const [costAmount, setCost] = useState(course.costAmount);
  const now = useNow();
  const editable =
    course.status === "PUBLISHED" &&
    !!course.thresholdDeadlineUtc &&
    now < new Date(course.thresholdDeadlineUtc).getTime();
  const threshold = price > 0 ? Math.ceil(costAmount / price) : 0;
  const openingPassed =
    !!course.firstSessionStartUtc &&
    Date.parse(course.firstSessionStartUtc) <= now;
  const copy = t.classWorkspace;
  const canWaive =
    course.status === "PUBLISHED" &&
    !openingPassed &&
    !["WAIVED_BY_MANAGER", "MET"].includes(course.thresholdStatus);
  const validPricing =
    Number.isFinite(price) &&
    price >= 1000 &&
    price % 1000 === 0 &&
    Number.isInteger(costAmount) &&
    costAmount >= 0 &&
    threshold <= course.capacity;
  function openAction(next: "pricing" | "waive") {
    mutation.reset();
    setReason("");
    setPrice(course.price);
    setCost(course.costAmount);
    setAction(next);
  }
  return (
    <>
      <Card title={t.managerOperations.thresholdTab}>
        <div className={styles.openingContent}>
          <div className={styles.openingStatus}>
            <StatusChip value={course.thresholdStatus} />
            <p>
              {l.confirmed}:{" "}
              <strong>
                {course.confirmedCount} /{" "}
                {course.breakEvenThreshold ??
                  (course.price > 0
                    ? Math.ceil(course.costAmount / course.price)
                    : 0)}
              </strong>
            </p>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>{l.deadline}</dt>
              <dd>{formatDateTime(course.thresholdDeadlineUtc)}</dd>
            </div>
            <div>
              <dt>{t.classWorkspace.price}</dt>
              <dd>{formatMoney(course.price)}</dd>
            </div>
            <div>
              <dt>{t.classWorkspace.cost}</dt>
              <dd>{formatMoney(course.costAmount)}</dd>
            </div>
          </dl>
          {course.thresholdStatus === "AT_RISK" &&
            course.thresholdResponseDeadlineUtc && (
              <p className={styles.openingNotice}>
                {vi ? "Hạn phản hồi: " : "Member response deadline: "}
                {formatDateTime(course.thresholdResponseDeadlineUtc)}.{" "}
                {vi
                  ? "Chốt cho phép mở dưới ngưỡng trước hạn này nếu cần. Hết hạn vẫn thiếu và chưa có miễn ngưỡng thì hệ thống hủy lớp, hoàn điểm cho người còn ghi danh."
                  : "Approve running below threshold before this deadline if needed. If still below threshold without a waiver when it expires, the system cancels the class and refunds remaining enrollments."}
              </p>
            )}
          {course.thresholdStatus === "AT_RISK" &&
            !course.thresholdResponseDeadlineUtc && (
              <div role="alert" className={styles.openingNotice}>
                <p>
                  {vi
                    ? "Chưa mở cửa sổ phản hồi. Nếu không còn đủ thời gian, Manager phải chốt mở dưới ngưỡng, hủy hoặc dời khai giảng. Lớp chưa được chốt sẽ không tự bắt đầu."
                    : "This class is below its minimum enrollment. Approve running below threshold, defer opening, or cancel and refund all remaining paid balances as points. The Coach and enrolled members will be notified."}
                </p>
                <Link href={`/manager/classes/${course.classId}?tab=sessions`}>
                  Move the first session
                </Link>
              </div>
            )}
          {course.status === "PUBLISHED" &&
            openingPassed &&
            !["MET", "WAIVED_BY_MANAGER"].includes(course.thresholdStatus) && (
              <p role="alert" className={styles.openingNotice}>
                {vi
                  ? "Đã qua giờ dự kiến nhưng lớp chưa được xác nhận. Dời lịch hoặc hủy lớp; không ghi nhận đã khai giảng."
                  : "The planned opening has passed without confirmation. Move the schedule or cancel; teaching has not been started."}
              </p>
            )}

          <div className={styles.actions}>
            {editable && (
              <button
                className="btn btn--secondary"
                onClick={() => openAction("pricing")}
              >
                {copy.editPricing}
              </button>
            )}
            {canWaive && (
              <button className="btn" onClick={() => openAction("waive")}>
                {copy.approveBelowThreshold}
              </button>
            )}
          </div>
          {!editable && <p className="small muted">{copy.pricingLocked}</p>}
          {course.status === "PUBLISHED" &&
            course.thresholdStatus === "AT_RISK" && (
              <details className={styles.guidance}>
                <summary>Cancel class and refund points</summary>
                <CourseCancellation
                  classId={course.classId}
                  onSaved={onSaved}
                  embedded
                />
              </details>
            )}
        </div>
      </Card>
      {action &&
        createPortal(
          <Dialog
            title={
              action === "pricing"
                ? copy.editPricing
                : copy.approveBelowThreshold
            }
            description={
              action === "pricing" ? l.thresholdHint : copy.approveBelowHint
            }
            size={action === "pricing" ? "lg" : "md"}
            className={styles.actionDialog}
            onClose={() => !mutation.busy && setAction(null)}
            footer={
              <>
                <button
                  className="btn btn--ghost"
                  disabled={mutation.busy}
                  onClick={() => setAction(null)}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  form="class-threshold-action"
                  className="btn"
                  disabled={
                    mutation.busy ||
                    reason.trim().length < 3 ||
                    (action === "pricing"
                      ? !editable || !validPricing
                      : !canWaive)
                  }
                >
                  {mutation.busy
                    ? t.common.loading
                    : action === "pricing"
                      ? l.save
                      : copy.approveBelowThreshold}
                </button>
              </>
            }
          >
            <form
              id="class-threshold-action"
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  mutation.busy ||
                  reason.trim().length < 3 ||
                  (action === "pricing"
                    ? !editable || !validPricing
                    : !canWaive)
                )
                  return;
                const ok = await mutation.run(() =>
                  action === "pricing"
                    ? api.put(
                        `/api/manager/classes/${course.classId}/threshold/pricing`,
                        { price, costAmount, reason: reason.trim() },
                      )
                    : api.post(
                        `/api/manager/classes/${course.classId}/threshold/waive`,
                        { reason: reason.trim() },
                      ),
                );
                if (ok) {
                  setAction(null);
                  onSaved();
                }
              }}
            >
              <fieldset disabled={mutation.busy}>
                {action === "pricing" && (
                  <>
                    <div className={styles.pricingFields}>
                      <Field label={t.classWorkspace.price}>
                        <input
                          required
                          type="number"
                          min={1000}
                          step={1000}
                          value={price}
                          onChange={(e) => setPrice(Number(e.target.value))}
                        />
                      </Field>
                      <Field label={t.classWorkspace.cost}>
                        <input
                          required
                          type="number"
                          min={0}
                          step={1}
                          value={costAmount}
                          onChange={(e) => setCost(Number(e.target.value))}
                        />
                      </Field>
                    </div>
                    <p className={styles.pricingThreshold}>
                      <span>{l.threshold}</span>
                      <strong>
                        {threshold} / {course.capacity}
                      </strong>
                    </p>
                    {threshold > course.capacity && (
                      <p role="alert" className={styles.openingNotice}>
                        {t.managerOperations.thresholdExceeded}
                      </p>
                    )}
                  </>
                )}
                <Field label={l.reason} required>
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </fieldset>
            </form>
            <MutationFeedback mutation={mutation} />
          </Dialog>,
          document.body,
        )}
    </>
  );
}
