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
  const { t, language } = useLanguage();
  const vi = language === "vi";
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
  const openingPassed =
    !!course.firstSessionStartUtc &&
    Date.parse(course.firstSessionStartUtc) <= now;
  return (
    <Card title={l.threshold}>
      <p>{l.thresholdHint}</p>
      <p className="small muted">
        {vi
          ? "Đánh giá trước ít nhất 72 giờ. Hội viên có tối đa 48 giờ phản hồi; hạn kết thúc trước buổi đầu ít nhất 24 giờ. Đủ ngưỡng thì xác nhận ngay."
          : "Review at least 72 hours before opening. Members have up to 48 hours to respond, ending at least 24 hours before the first session. Confirm immediately once the threshold is met."}
      </p>
      <StatusChip value={course.thresholdStatus} />
      <p>
        {l.confirmed}: {course.confirmedCount} /{" "}
        {course.breakEvenThreshold ?? "—"} · {l.held}: {course.activeHoldCount}{" "}
        · {l.deadline}: {formatDateTime(course.thresholdDeadlineUtc)}
      </p>
      {course.thresholdStatus === "AT_RISK" &&
        course.thresholdResponseDeadlineUtc && (
          <p>
            {vi ? "Hạn phản hồi: " : "Member response deadline: "}
            {formatDateTime(course.thresholdResponseDeadlineUtc)}.{" "}
            {vi
              ? "Chốt cho phép mở dưới ngưỡng trước hạn này nếu cần. Hết hạn vẫn thiếu và chưa có miễn ngưỡng thì hệ thống hủy lớp, hoàn điểm cho người còn ghi danh."
              : "Approve running below threshold before this deadline if needed. If still below threshold without a waiver when it expires, the system cancels the class and refunds remaining enrollments."}
          </p>
        )}
      {course.thresholdStatus === "AT_RISK" &&
        !course.thresholdResponseDeadlineUtc && (
          <div role="alert">
            <p>
              {vi
                ? "Chưa mở cửa sổ phản hồi. Nếu không còn đủ thời gian, Manager phải chốt mở dưới ngưỡng, hủy hoặc dời khai giảng. Lớp chưa được chốt sẽ không tự bắt đầu."
                : "No member response window is open. If there is not enough time, decide now whether to run below threshold, cancel, or defer opening. An unconfirmed class will not start automatically."}
            </p>
            <Link href={`/manager/classes/${course.classId}?tab=sessions`}>
              Move the first session
            </Link>
            {" · "}
            <Link
              href={`/manager/classes/${course.classId}?tab=overview#course-cancellation`}
            >
              Cancel the course
            </Link>
          </div>
        )}
      {course.status === "PUBLISHED" &&
        openingPassed &&
        !["MET", "WAIVED_BY_MANAGER"].includes(course.thresholdStatus) && (
          <p role="alert">
            {vi
              ? "Đã qua giờ dự kiến nhưng lớp chưa được xác nhận. Dời lịch hoặc hủy lớp; không ghi nhận đã khai giảng."
              : "The planned opening has passed without confirmation. Move the schedule or cancel; teaching has not been started."}
          </p>
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
                openingPassed ||
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
