"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import type { MemberSupportRequestDto } from "@/lib/types";
import { ROLE_RANK, roleKey } from "./support-shared";
import styles from "./support.module.css";

export type SupportAssignee = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

function roleLabel(role: string) {
  return role
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[_\s]+/)
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
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [mode, setMode] = useState<"progress" | "done" | "reject">("progress");
  const { language } = useLanguage();
  const { user } = useAuth();
  const vi = language === "vi";
  const [assigneeId, setAssigneeId] = useState(request.assignedToUserId ?? "");
  const [note, setNote] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [busy, setBusy] = useState<
    "assign" | "progress" | "done" | "reject" | null
  >(null);
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
    kind: "assign" | "progress" | "done" | "reject",
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
      if (kind === "assign") setTransferNote("");
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

  const closed = ["DONE", "REJECTED", "CLOSED"].includes(request.status);
  const canFinalizeUnassignedPayoutReview =
    user?.role === "CenterManager" &&
    request.category === "PAYMENT" &&
    !!request.payout &&
    !closed;
  const noteReady = note.trim().length >= 3;
  const chosen = assignees.find((x) => x.userId === assigneeId);
  const escalating =
    !!chosen &&
    ROLE_RANK[roleKey(chosen.role)] > ROLE_RANK[roleKey(user?.role)];
  const transferNoteMissing = escalating && transferNote.trim().length < 3;

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
            {closed
              ? vi
                ? "Kết quả xử lý: "
                : "Final note: "
              : vi
                ? "Cập nhật gần nhất: "
                : "Latest update: "}
          </strong>
          {request.progressNote}
        </p>
      )}

      {closed && (
        <p className={styles.closedHint}>This request is finalized.</p>
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
              disabled={
                busy !== null ||
                !assigneeId ||
                assigneeId === request.assignedToUserId ||
                transferNoteMissing
              }
              onClick={() =>
                act(
                  "assign",
                  { assigneeUserId: assigneeId, note: transferNote.trim() },
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
          {escalating && (
            <label className={styles.field}>
              Transfer note (required for escalation)
              <textarea
                value={transferNote}
                maxLength={1000}
                disabled={busy !== null}
                placeholder="Why does this request need a Manager?"
                onChange={(event) => setTransferNote(event.target.value)}
              />
              {transferNoteMissing && (
                <span>Write at least 3 characters before transferring.</span>
              )}
            </label>
          )}

          <div
            className={styles.actionMode}
            role="group"
            aria-label="Ticket action"
          >
            {(["progress", "done", "reject"] as const).map((action) => (
              <button
                key={action}
                type="button"
                className={styles.actionModeButton}
                aria-pressed={mode === action}
                disabled={busy !== null}
                onClick={() => {
                  setMode(action);
                  setConfirmFinal(false);
                  setNote("");
                }}
              >
                {action === "progress"
                  ? "Add Progress Note"
                  : action === "done"
                    ? "Mark as Done"
                    : "Reject Request"}
              </button>
            ))}
          </div>
          <label className={styles.field}>
            {mode === "progress"
              ? "Progress note"
              : mode === "done"
                ? "Completion note"
                : "Rejection reason"}
            <textarea
              rows={3}
              value={note}
              maxLength={1000}
              disabled={busy !== null}
              placeholder={
                mode === "progress"
                  ? "Record what has been checked or what happens next."
                  : mode === "done"
                    ? "Describe how the request was completed."
                    : "Explain why this request is rejected."
              }
              onChange={(e) => {
                setNote(e.target.value);
                setConfirmFinal(false);
              }}
            />
            <span className={styles.counter}>{note.length}/1000</span>
          </label>
          <div className={styles.buttons}>
            {mode === "progress" ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={
                  busy !== null || !request.assignedToUserId || !noteReady
                }
                onClick={() =>
                  act("progress", { note: note.trim() }, "Progress updated.")
                }
              >
                {busy === "progress" ? "Saving…" : "Update progress"}
              </button>
            ) : confirmFinal ? (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy !== null}
                  onClick={() => setConfirmFinal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={
                    busy !== null ||
                    (!request.assignedToUserId &&
                      !canFinalizeUnassignedPayoutReview) ||
                    !noteReady
                  }
                  onClick={async () => {
                    await act(
                      mode,
                      { reason: note.trim() },
                      mode === "done"
                        ? "Request completed."
                        : "Request rejected.",
                    );
                    setConfirmFinal(false);
                  }}
                >
                  {busy === mode
                    ? "Saving…"
                    : mode === "done"
                      ? "Confirm Done"
                      : "Confirm Reject"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={
                  busy !== null ||
                  (!request.assignedToUserId &&
                    !canFinalizeUnassignedPayoutReview) ||
                  !noteReady
                }
                onClick={() => setConfirmFinal(true)}
              >
                {mode === "done" ? "Mark as Done" : "Reject Request"}
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
