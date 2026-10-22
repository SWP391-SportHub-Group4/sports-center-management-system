"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock, RefreshCw, Send, X } from "lucide-react";
import { AsyncSection, Feedback } from "@/components/ui";
import { useApi, useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { ApiError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import type { CourseSessionDto } from "@/lib/types";
import {
  classChangeApi,
  coachChangeTypeLabel,
  changeStatusLabel,
  changeRequestStatusLabel,
} from "./class-change-api";
import styles from "./class-change.module.css";
import { RequestOutcome } from "./request-outcome";

export function CoachClassChanges({
  session,
  onChanged,
  onStateChange,
}: {
  session?: CourseSessionDto;
  onChanged?: () => void;
  onStateChange?: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const state = useApi(
    (signal) =>
      classChangeApi.list(
        false,
        { page, sessionId: session?.sessionId, status: status || undefined },
        signal,
      ),
    [page, session?.sessionId, status],
  );
  const action = useAction();
  const lock = useRef(false);
  const now = useNow(1000);
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState("");
  const pending = state.data?.items.find((r) => r.status === "PENDING");
  const dirty = form && !pending && reason !== "";
  useEffect(() => {
    onStateChange?.({ dirty, busy: action.busy });
    return () => onStateChange?.({ dirty: false, busy: false });
  }, [dirty, action.busy, onStateChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const requestId = useRef<string | null>(null);
  const absenceOpen =
    !!session && Date.parse(session.startAtUtc) - now >= 6 * 3600000;
  function openForm() {
    if (pending) return;
    setReason("");
    requestId.current = null;
    setForm(true);
  }
  const eligible =
    session &&
    session.status === "SCHEDULED" &&
    Date.parse(session.startAtUtc) > now;
  const resetRetry = () => {
    requestId.current = null;
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || !eligible || !absenceOpen || pending || lock.current)
      return;
    lock.current = true;
    try {
      const saved = await action.run(
        async () => {
          requestId.current ??= crypto.randomUUID();
          const body = {
            requestId: requestId.current,
            type: "ABSENCE" as const,
            reason: reason.trim(),
            proposedStartAtUtc: null,
            proposedEndAtUtc: null,
          };
          try {
            return await classChangeApi.create(session.sessionId, body);
          } catch (error) {
            if (
              error instanceof ApiError &&
              [
                "class_change_pending",
                "class_change_stale",
                "session_not_assigned",
                "session_not_editable",
              ].includes(error.code)
            ) {
              setForm(false);
              state.reload();
              onChanged?.();
            }
            throw error;
          }
        },
        vi
          ? "Đã gửi yêu cầu đến Center Manager."
          : "Request sent to your Center Manager.",
      );
      if (saved) {
        setForm(false);
        setReason("");
        resetRetry();
        setPage(1);
        state.reload();
        onChanged?.();
      }
    } finally {
      lock.current = false;
    }
  }
  return (
    <section
      className={styles.panel}
      aria-label={vi ? "Yêu cầu vắng" : "Absence request"}
    >
      <div className={styles.heading}>
        <h3>{vi ? "Yêu cầu vắng" : "Absence request"}</h3>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          disabled={state.loading || action.busy}
          onClick={() => state.reload()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {vi ? "Cập nhật" : "Refresh"}
        </button>
      </div>
      <p className={styles.hint}>
        {vi
          ? "Báo vắng trước giờ học ít nhất 6 tiếng. Manager quyết định dạy thay, dời buổi hoặc hủy kèm học bù. Lịch hiện tại vẫn có hiệu lực khi chờ duyệt."
          : "Request absence at least 6 hours before class. Your Manager will arrange a substitute, reschedule or makeup. Your current schedule stays in effect until reviewed."}
      </p>
      <Feedback error={action.error} success={action.success} />
      {!session && (
        <div
          className={styles.statusFilters}
          role="group"
          aria-label={vi ? "Lọc trạng thái yêu cầu" : "Filter request status"}
        >
          {["", "PENDING", "RESOLVED", "REJECTED", "WITHDRAWN"].map((value) => (
            <button
              key={value}
              type="button"
              className="btn btn--quiet btn--sm"
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {value
                ? changeStatusLabel(value, vi)
                : vi
                  ? "Tất cả"
                  : "All requests"}
            </button>
          ))}
        </div>
      )}
      {eligible &&
        !state.loading &&
        !state.error &&
        !pending &&
        !form &&
        !!state.data?.totalCount && (
          <div className={styles.changeAction}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={openForm}
              disabled={action.busy || !absenceOpen}
            >
              <CalendarClock size={18} aria-hidden="true" />
              Request absence
            </button>
          </div>
        )}
      {pending && (
        <p className={styles.hint} role="status">
          Your request is awaiting Manager review. Submitted requests cannot be
          edited; you can withdraw it below.
        </p>
      )}
      {form && eligible && !pending && (
        <form className={styles.form} onSubmit={submit}>
          <label>
            {vi ? "Lý do" : "Reason"}
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              disabled={action.busy || !absenceOpen}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                resetRetry();
              }}
            />
          </label>
          <div className={styles.actions}>
            <button
              className="btn"
              disabled={action.busy || !absenceOpen || reason.trim().length < 3}
            >
              <Send size={16} aria-hidden="true" />
              {action.busy
                ? vi
                  ? "Đang gửi…"
                  : "Sending…"
                : vi
                  ? "Gửi yêu cầu"
                  : "Send request"}
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              disabled={action.busy}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    vi
                      ? "Bỏ nội dung yêu cầu chưa gửi?"
                      : "Discard this unsent request?",
                  )
                )
                  setForm(false);
              }}
            >
              {vi ? "Đóng" : "Close"}
            </button>
          </div>
        </form>
      )}
      {eligible && !absenceOpen && (
        <p className={styles.hint} role="status">
          Absence requests close 6 hours before class. Contact your Manager
          directly for urgent absences. You can still withdraw a pending
          request.
        </p>
      )}
      <AsyncSection state={state}>
        {(data) => (
          <>
            {!data.items.length && (
              <div className={styles.empty}>
                <CalendarClock size={36} aria-hidden="true" />
                <strong>
                  {vi
                    ? "Không có yêu cầu trong mục này"
                    : "No requests in this view"}
                </strong>
                {eligible && !form ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={openForm}
                    disabled={action.busy || !absenceOpen}
                  >
                    <CalendarClock size={18} aria-hidden="true" />
                    Request absence
                  </button>
                ) : !session ? (
                  <p className={styles.hint}>
                    {vi
                      ? "Chọn buổi học sắp tới trong Lịch dạy để tạo yêu cầu."
                      : "Select an upcoming session in Schedule to create a request."}
                  </p>
                ) : null}
              </div>
            )}
            <div className={styles.history}>
              {data.items.map((r) => (
                <article key={r.requestId}>
                  <div className={styles.heading}>
                    <h3>
                      {!session && `${r.className} · `}
                      {vi ? "Buổi" : "Session"} {r.sessionNo} ·{" "}
                      {coachChangeTypeLabel(r.type, vi)}
                    </h3>
                    <span className={styles.status} data-status={r.status}>
                      {changeRequestStatusLabel(r, vi)}
                    </span>
                  </div>
                  <dl className={styles.requestDates}>
                    <div>
                      <dt>{vi ? "Lịch ban đầu" : "Original session"}</dt>
                      <dd>{formatDateTime(r.originalStartAtUtc)}</dd>
                    </div>
                    {r.proposedStartAtUtc && (
                      <div>
                        <dt>{vi ? "Lịch đề xuất" : "Suggested session"}</dt>
                        <dd>{formatDateTime(r.proposedStartAtUtc)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{vi ? "Đã gửi" : "Submitted"}</dt>
                      <dd>{formatDateTime(r.createdAtUtc)}</dd>
                    </div>
                  </dl>
                  <div className={styles.requestReason}>
                    <strong>
                      {r.type === "ABSENCE"
                        ? vi
                          ? "Lý do vắng"
                          : "Reason for absence"
                        : vi
                          ? "Lý do thay đổi"
                          : "Reason for change"}
                    </strong>
                    <p>{r.reason}</p>
                  </div>
                  <RequestOutcome request={r} />
                  {r.status === "PENDING" && (
                    <button
                      type="button"
                      className="btn btn--quiet btn--sm"
                      disabled={action.busy}
                      onClick={async () => {
                        if (
                          lock.current ||
                          !window.confirm(
                            vi
                              ? "Rút yêu cầu này? Lịch học vẫn giữ nguyên."
                              : "Withdraw this request? Your schedule will remain unchanged.",
                          )
                        )
                          return;
                        lock.current = true;
                        try {
                          if (
                            await action.run(
                              async () => {
                                try {
                                  return await classChangeApi.withdraw(
                                    r.requestId,
                                  );
                                } catch (error) {
                                  if (
                                    error instanceof ApiError &&
                                    (error.status === 404 ||
                                      error.code === "class_change_not_pending")
                                  ) {
                                    state.reload();
                                    onChanged?.();
                                  }
                                  throw error;
                                }
                              },
                              vi ? "Đã rút yêu cầu." : "Request withdrawn.",
                            )
                          ) {
                            setForm(false);
                            state.reload();
                            onChanged?.();
                          }
                        } finally {
                          lock.current = false;
                        }
                      }}
                    >
                      <X size={15} aria-hidden="true" />
                      {vi ? "Rút yêu cầu" : "Withdraw request"}
                    </button>
                  )}
                </article>
              ))}
            </div>
            {data.totalCount > 50 && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  {vi ? "Trước" : "Previous"}
                </button>
                <span>
                  {page} / {Math.ceil(data.totalCount / 50)}
                </span>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  disabled={page * 50 >= data.totalCount}
                  onClick={() => setPage(page + 1)}
                >
                  {vi ? "Tiếp" : "Next"}
                </button>
              </div>
            )}
          </>
        )}
      </AsyncSection>
    </section>
  );
}
