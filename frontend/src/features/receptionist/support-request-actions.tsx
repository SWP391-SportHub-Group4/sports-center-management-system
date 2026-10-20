"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { MemberSupportRequestDto } from "@/lib/types";
import styles from "./support.module.css";

export type SupportAssignee = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type SupportFeedback = { tone: "ok" | "error"; text: string };

/** Gán/chuyển người xử lý, ghi tiến độ hoặc đóng yêu cầu; mỗi thao tác báo kết quả ngay dưới nút. */
export function SupportRequestActions({
  request,
  assignees,
  feedback: lifted,
  onFeedback: liftedSet,
  onChanged,
  layout = "profile",
  collapsible = false,
}: {
  request: MemberSupportRequestDto;
  assignees: SupportAssignee[];
  /** Kết quả thao tác gần nhất; do danh sách giữ để không mất khi danh sách tải lại. */
  feedback?: SupportFeedback | null;
  onFeedback?: (feedback: SupportFeedback | null) => void;
  onChanged: () => void;
  layout?: "profile" | "queue";
  /** Danh sách dài: ẩn biểu mẫu xử lý sau nút "Xử lý" để mỗi yêu cầu chỉ chiếm vài dòng. */
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const { language } = useLanguage();
  const vi = language === "vi";
  const [assigneeId, setAssigneeId] = useState(request.assignedToUserId ?? "");
  // The queue refreshes its rows after assignments. Sync the selected assignee.
  
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"assign" | "progress" | "close" | null>(
    null,
  );
  const lock = useRef(false);

  const [local, setLocal] = useState<SupportFeedback | null>(null);
  const feedback = liftedSet ? (lifted ?? null) : local;
  const onFeedback = liftedSet ?? setLocal;

  const assigneeName = request.assignedToUserId
    ? (request.assignedToName ??
      assignees.find((x) => x.userId === request.assignedToUserId)?.name ??
      (vi ? "Nhân viên đã nghỉ" : "Former staff member"))
    : null;

  async function act(
    kind: "assign" | "progress" | "close",
    body: Record<string, string>,
    success: string,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    onFeedback(null);
    try {
      await api.post(
        `/api/member-support-requests/${request.requestId}/${kind}`,
        body,
      );
      setNote("");
      onFeedback({ tone: "ok", text: success });
      onChanged();
    } catch (e) {
      onFeedback({
        tone: "error",
        text:
          e instanceof Error
            ? e.message
            : vi
              ? "Không thể cập nhật yêu cầu này."
              : "Could not update this request.",
      });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  const closed = request.status === "CLOSED";
  const noteReady = note.trim().length >= 3;
  const chosen = assignees.find((x) => x.userId === assigneeId);

  return (
    <div
      className={`${styles.manage} ${layout === "queue" ? styles.manageQueue : ""}`}
    >
      <div className={styles.requestTop}>
        <p className={styles.assignee}>
          <span>{vi ? "Người xử lý" : "Assigned to"}</span>
          <strong>{assigneeName ?? (vi ? "Chưa gán" : "Unassigned")}</strong>
        </p>
        {collapsible && !closed && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (vi ? "Thu gọn" : "Hide") : vi ? "Xử lý" : "Manage"}
          </button>
        )}
      </div>
      {request.progressNote && (
        <p className={styles.latest}>
          <strong>
            {request.status === "CLOSED"
              ? vi
                ? "Kết quả xử lý: "
                : "Resolution: "
              : vi
                ? "Cập nhật gần nhất: "
                : "Latest update: "}
          </strong>
          {request.progressNote}
        </p>
      )}

      {closed && (
        <p className={styles.closedHint}>
          This request has been closed. Its final resolution is shown above.
        </p>
      )}
      {!closed && (!collapsible || expanded) && (
        <>
          <div className={styles.assignRow}>
            <label className={styles.field}>
              {vi ? "Gán cho" : "Assign to"}
              <select
                value={assigneeId}
                disabled={busy !== null}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">
                  {vi ? "Chọn nhân viên" : "Choose staff"}
                </option>
                {assignees.map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.name} ({roleLabel(x.role)})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy !== null || !assigneeId || assigneeId === request.assignedToUserId}
              onClick={() =>
                act(
                  "assign",
                  { assigneeUserId: assigneeId },
                  vi
                    ? `Đã gán yêu cầu cho ${chosen?.name ?? "nhân viên"}.`
                    : `Request assigned to ${chosen?.name ?? "staff member"}.`,
                )
              }
            >
              {busy === "assign"
                ? vi
                  ? "Đang gán…"
                  : "Assigning…"
                : vi
                  ? "Gán"
                  : "Assign"}
            </button>
          </div>

          <label className={styles.field}>
            {vi ? "Tiến độ hoặc kết quả xử lý" : "Progress or resolution"}
            <textarea
              rows={3}
              value={note}
              maxLength={1000}
              disabled={busy !== null}
              placeholder={
                request.assignedToUserId
                  ? ""
                  : vi
                    ? "Gán người xử lý trước."
                    : "Assign someone first."
              }
              onChange={(e) => setNote(e.target.value)}
            />
            <span className={styles.counter}>
              {vi
                ? "Ghi tiến độ để cập nhật, hoặc kết quả cuối cùng để đóng."
                : "Write a progress note to update, or a final resolution to close."}{" "}
              {note.length}/1000
            </span>
          </label>
          <div className={styles.buttons}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={
                busy !== null || !request.assignedToUserId || !noteReady
              }
              onClick={() =>
                act(
                  "progress",
                  { note: note.trim() },
                  vi ? "Đã cập nhật tiến độ." : "Progress updated.",
                )
              }
            >
              {busy === "progress"
                ? vi
                  ? "Đang lưu…"
                  : "Saving…"
                : vi
                  ? "Cập nhật tiến độ"
                  : "Update progress"}
            </button>
            {confirmClose ? (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy !== null}
                  onClick={() => setConfirmClose(false)}
                >
                  {vi ? "Hủy" : "Cancel"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null}
                  onClick={async () => {
                    await act(
                      "close",
                      { resolution: note.trim() },
                      vi ? "Đã đóng yêu cầu." : "Request closed.",
                    );
                    setConfirmClose(false);
                  }}
                >
                  {busy === "close"
                    ? vi
                      ? "Đang đóng…"
                      : "Closing…"
                    : vi
                      ? "Xác nhận đóng"
                      : "Confirm close"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={
                  busy !== null || !request.assignedToUserId || !noteReady
                }
                onClick={() => setConfirmClose(true)}
              >
                {vi ? "Đóng yêu cầu" : "Close request"}
              </button>
            )}
          </div>
        </>
      )}

      {feedback && (
        <p
          className={`${styles.feedback} ${feedback.tone === "error" ? styles.feedbackError : ""}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
