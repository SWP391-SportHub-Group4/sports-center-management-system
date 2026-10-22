"use client";

import {
  CheckCircle2,
  Clock3,
  X,
  CalendarDays,
  Users,
  MapPin,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatTime } from "@/lib/format";
import {
  changeOutcomeLabel,
  type ClassChangeRequest,
} from "./class-change-api";
import styles from "./request-outcome.module.css";

export function RequestOutcome({ request }: { request: ClassChangeRequest }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const pending = request.status === "PENDING";
  const rejected = request.status === "REJECTED";
  const withdrawn =
    request.status === "WITHDRAWN" &&
    request.resolutionType !== "SCHEDULE_UPDATED";
  const automatic = request.resolutionType === "SCHEDULE_UPDATED";
  const outcome = request.outcome;
  const action = outcome?.action ?? request.resolutionType ?? "";
  const title = pending
    ? vi
      ? "Đang chờ Manager duyệt"
      : "Awaiting Manager review"
    : rejected
      ? vi
        ? "Yêu cầu bị từ chối"
        : "Request rejected"
      : withdrawn
        ? vi
          ? "Đã rút yêu cầu"
          : "Request cancelled"
        : changeOutcomeLabel(action, vi);
  const Icon = pending ? Clock3 : rejected || withdrawn ? X : CheckCircle2;

  return (
    <section
      className={styles.outcome}
      data-state={
        pending
          ? "pending"
          : rejected
            ? "rejected"
            : withdrawn
              ? "withdrawn"
              : "resolved"
      }
      aria-label={vi ? "Kết quả xử lý" : "Request outcome"}
    >
      <header className={styles.heading}>
        <Icon size={20} aria-hidden="true" />
        <div>
          <span className={styles.eyebrow}>
            {vi ? "Kết quả xử lý" : "Request outcome"}
          </span>
          <h4>{title}</h4>
        </div>
      </header>
      {pending ? (
        <p>
          {vi
            ? "Manager sẽ chọn dạy thay, dời lịch hoặc hủy kèm học bù. Lịch được phân công vẫn có hiệu lực khi chờ duyệt."
            : "The Manager will arrange a substitute, reschedule or makeup. The assigned session stays in effect until reviewed."}
        </p>
      ) : (
        <>
          {automatic && (
            <p>
              {vi
                ? "Manager đã cập nhật lịch trực tiếp nên yêu cầu này được tự đóng."
                : "The Manager updated the schedule directly, so this pending request was closed automatically."}
            </p>
          )}
          {rejected && (
            <p>
              {vi
                ? "Quyết định từ chối không thay đổi lịch được phân công."
                : "This decision did not change the teaching assignment."}
            </p>
          )}
          {withdrawn && (
            <p>
              {vi
                ? "Coach đã rút yêu cầu. Thao tác này không thay đổi lịch học."
                : "The Coach cancelled this request. Cancelling the request did not change the teaching schedule."}
            </p>
          )}
          {!rejected && !withdrawn && outcome && (
            <>
              {outcome.source === "CURRENT_SCHEDULE" && (
                <p className={styles.legacy}>
                  {vi
                    ? "Yêu cầu cũ chưa lưu chi tiết lịch tại thời điểm xử lý. Bên dưới là lịch hiện tại, có thể đã thay đổi sau đó."
                    : "This earlier request has no schedule snapshot from review time. The current schedule below may include later changes."}
                </p>
              )}
              {action === "COURSE_CANCELLED" ? (
                <p>
                  {vi
                    ? "Khóa học đã bị hủy; buổi này không được tổ chức."
                    : "This session was cancelled with the class."}
                </p>
              ) : (
                <dl className={styles.facts}>
                  <div>
                    <dt>
                      <CalendarDays size={16} aria-hidden="true" />
                      {outcome.source === "CURRENT_SCHEDULE"
                        ? vi
                          ? "Lịch hiện tại"
                          : "Current schedule"
                        : action === "CANCEL_WITH_MAKEUP"
                          ? vi
                            ? "Buổi bù"
                            : "Makeup session"
                          : vi
                            ? "Lịch sau xử lý"
                            : "Confirmed session"}
                    </dt>
                    <dd>{formatDateTime(outcome.startAtUtc)}</dd>
                    <dd className={styles.secondary}>
                      {formatTime(outcome.startAtUtc)} –{" "}
                      {formatTime(outcome.endAtUtc)} · Session{" "}
                      {outcome.sessionNo}
                    </dd>
                    {outcome.source === "CURRENT_SCHEDULE" && (
                      <dd className={styles.secondary}>
                        {vi ? "Trạng thái hiện tại" : "Current status"}:{" "}
                        {outcome.sessionStatus}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt>
                      <Users size={16} aria-hidden="true" />
                      {outcome.source !== "CURRENT_SCHEDULE" &&
                      action === "SUBSTITUTE"
                        ? vi
                          ? "HLV dạy thay"
                          : "Substitute coach"
                        : vi
                          ? "HLV phụ trách"
                          : "Assigned coach"}
                    </dt>
                    <dd>
                      {outcome.coachName ||
                        (vi ? "Chưa có thông tin" : "Name unavailable")}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <MapPin size={16} aria-hidden="true" />
                      {vi ? "Sân / phòng" : "Court / room"}
                    </dt>
                    <dd>
                      {outcome.roomName ||
                        (vi ? "Chưa có thông tin" : "Name unavailable")}
                    </dd>
                  </div>
                </dl>
              )}
            </>
          )}
          {!rejected && !withdrawn && !outcome && (
            <p>
              {vi
                ? "Chi tiết lịch sau xử lý chưa được lưu cho yêu cầu này."
                : "Detailed schedule information was not recorded for this request."}
            </p>
          )}
          {(outcome?.reason || request.reviewNote) && (
            <div className={styles.note}>
              <strong>{vi ? "Ghi chú xử lý" : "Decision note"}</strong>
              <p>{outcome?.reason || request.reviewNote}</p>
            </div>
          )}
          {(outcome?.handledBy || request.reviewedAtUtc) && (
            <footer className={styles.meta}>
              {outcome?.source === "DECISION" && (
                <span>
                  {vi
                    ? "Thông tin tại thời điểm xử lý"
                    : "Details at time of decision"}
                </span>
              )}
              {outcome?.handledBy && (
                <span>
                  {vi ? "Xử lý bởi" : "Handled by"}: {outcome.handledBy}
                </span>
              )}
              {request.reviewedAtUtc && (
                <time dateTime={request.reviewedAtUtc}>
                  {formatDateTime(request.reviewedAtUtc)}
                </time>
              )}
            </footer>
          )}
        </>
      )}
    </section>
  );
}
