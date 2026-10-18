"use client";

import { useState } from "react";
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

export type SupportFeedback = { tone: "ok" | "error"; text: string };

/** Gán/chuyển người xử lý, ghi tiến độ hoặc đóng yêu cầu; mỗi thao tác báo kết quả ngay dưới nút. */
export function SupportRequestActions({
  request,
  assignees,
  feedback: lifted,
  onFeedback: liftedSet,
  onChanged,
}: {
  request: MemberSupportRequestDto;
  assignees: SupportAssignee[];
  /** Kết quả thao tác gần nhất; do danh sách giữ để không mất khi danh sách tải lại. */
  feedback?: SupportFeedback | null;
  onFeedback?: (feedback: SupportFeedback | null) => void;
  onChanged: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [assigneeId, setAssigneeId] = useState(request.assignedToUserId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"assign" | "progress" | "close" | null>(
    null,
  );

  const [local, setLocal] = useState<SupportFeedback | null>(null);
  const feedback = liftedSet ? (lifted ?? null) : local;
  const onFeedback = liftedSet ?? setLocal;

  const assigneeName = request.assignedToUserId
    ? (assignees.find((x) => x.userId === request.assignedToUserId)?.name ??
      (vi ? "Nhân viên đã nghỉ" : "Former staff member"))
    : null;

  async function act(
    kind: "assign" | "progress" | "close",
    body: Record<string, string>,
    success: string,
  ) {
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
      setBusy(null);
    }
  }

  const closed = request.status === "CLOSED";
  const noteReady = note.trim().length >= 3;
  const chosen = assignees.find((x) => x.userId === assigneeId);

  return (
    <div className={styles.manage}>
      <p className={styles.assignee}>
        <span>{vi ? "Người xử lý" : "Assigned to"}</span>
        <strong>{assigneeName ?? (vi ? "Chưa gán" : "Unassigned")}</strong>
      </p>
      {request.progressNote && (
        <p className={styles.latest}>
          <strong>{vi ? "Cập nhật gần nhất: " : "Latest update: "}</strong>
          {request.progressNote}
        </p>
      )}

      {!closed && (
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
                    {x.name} ({x.role})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy !== null || !assigneeId}
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
                  ? "Gán / chuyển"
                  : "Assign / transfer"}
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
                    ? "Gán người xử lý trước khi ghi tiến độ."
                    : "Assign someone before adding progress."
              }
              onChange={(e) => setNote(e.target.value)}
            />
            <span className={styles.counter}>{note.length}/1000</span>
          </label>
          <div className={styles.buttons}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy !== null || !request.assignedToUserId || !noteReady}
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
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy !== null || !request.assignedToUserId || !noteReady}
              onClick={() =>
                act(
                  "close",
                  { resolution: note.trim() },
                  vi ? "Đã đóng yêu cầu." : "Request closed.",
                )
              }
            >
              {busy === "close"
                ? vi
                  ? "Đang đóng…"
                  : "Closing…"
                : vi
                  ? "Đóng yêu cầu"
                  : "Close request"}
            </button>
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
