"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock, RefreshCw, Send, X } from "lucide-react";
import { AsyncSection, Feedback } from "@/components/ui";
import { useApi, useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { vietnamUtc } from "@/lib/vietnam-time";
import type { CourseSessionDto } from "@/lib/types";
import {
  classChangeApi,
  changeTypeLabel,
  changeStatusLabel,
  type ClassChangeType,
} from "./class-change-api";
import styles from "./class-change.module.css";

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
  const now = useNow();
  const [form, setForm] = useState(false);
  const [type, setType] = useState<ClassChangeType>("SUBSTITUTE");
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const dirty = form && !!(reason.trim() || start);
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
  const pending = state.data?.items.some((r) => r.status === "PENDING");
  const eligible =
    session &&
    session.status === "SCHEDULED" &&
    Date.parse(session.startAtUtc) > now;
  const resetRetry = () => {
    requestId.current = null;
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || lock.current) return;
    lock.current = true;
    try {
      const saved = await action.run(
        async () => {
          const proposed =
            type !== "SUBSTITUTE" && start ? vietnamUtc(start) : null;
          const end = proposed
            ? new Date(
                Date.parse(proposed) +
                  Date.parse(session.endAtUtc) -
                  Date.parse(session.startAtUtc),
              ).toISOString()
            : null;
          requestId.current ??= crypto.randomUUID();
          return classChangeApi.create(session.sessionId, {
            requestId: requestId.current,
            type,
            reason: reason.trim(),
            proposedStartAtUtc: proposed,
            proposedEndAtUtc: end,
          });
        },
        vi
          ? "Đã gửi yêu cầu đến Center Manager."
          : "Request sent to your Center Manager.",
      );
      if (saved) {
        setForm(false);
        setReason("");
        setStart("");
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
      aria-label={vi ? "Yêu cầu đổi buổi học" : "Session change requests"}
    >
      <div className={styles.heading}>
        <h3>{vi ? "Yêu cầu đổi lịch" : "Schedule change requests"}</h3>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          disabled={state.loading || action.busy}
          onClick={() => state.reload()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {vi ? "Cập nhật" : "Refresh"}
        </button>
        {eligible && !pending && !state.loading && !state.error && !form && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setForm(true)}
          >
            <CalendarClock size={16} aria-hidden="true" />
            {vi ? "Yêu cầu thay đổi" : "Request a change"}
          </button>
        )}
      </div>
      <p className={styles.hint}>
        {vi
          ? "Lịch vẫn có hiệu lực khi chờ xử lý. Nếu sát giờ dạy, hãy gọi trực tiếp cho Manager để báo gấp."
          : "Your current schedule remains in effect until reviewed. For urgent changes, contact your Manager directly as well."}
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
      {form && (
        <form className={styles.form} onSubmit={submit}>
          <label>
            {vi ? "Phương án đề xuất" : "Requested change"}
            <select
              value={type}
              disabled={action.busy}
              onChange={(e) => {
                setType(e.target.value as ClassChangeType);
                setStart("");
                resetRetry();
              }}
            >
              {(
                ["SUBSTITUTE", "RESCHEDULE", "CANCEL_WITH_MAKEUP"] as const
              ).map((id) => (
                <option key={id} value={id}>
                  {changeTypeLabel(id, vi)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {vi ? "Lý do" : "Reason"}
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              disabled={action.busy}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                resetRetry();
              }}
            />
          </label>
          {type !== "SUBSTITUTE" && (
            <label>
              {vi
                ? "Giờ bắt đầu đề xuất (không bắt buộc)"
                : "Suggested start (optional)"}
              <input
                type="datetime-local"
                value={start}
                disabled={action.busy}
                onChange={(e) => {
                  setStart(e.target.value);
                  resetRetry();
                }}
              />
              <small>
                {vi
                  ? "Giờ Việt Nam. Manager xác nhận giờ cuối cùng; thời lượng buổi học được giữ nguyên."
                  : "Vietnam time. The Manager confirms the final time; session duration stays unchanged."}
              </small>
            </label>
          )}
          <div className={styles.actions}>
            <button className="btn" disabled={action.busy}>
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
                  !reason.trim() ||
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
                <p className={styles.hint}>
                  {vi
                    ? "Để tạo yêu cầu, chọn buổi học sắp tới trong Lịch dạy và mở mục yêu cầu đổi lịch."
                    : "To create a request, select an upcoming session in Teaching schedule and open schedule change requests."}
                </p>
              </div>
            )}
            <div className={styles.history}>
              {data.items.map((r) => (
                <article key={r.requestId}>
                  <div className={styles.heading}>
                    <h3>
                      {!session && `${r.className} · `}
                      {vi ? "Buổi" : "Session"} {r.sessionNo} ·{" "}
                      {changeTypeLabel(r.type, vi)}
                    </h3>
                    <span className={styles.status} data-status={r.status}>
                      {changeStatusLabel(r.status, vi)}
                    </span>
                  </div>
                  <dl className={styles.requestDates}>
                    <div>
                      <dt>{vi ? "Lịch hiện tại" : "Current session"}</dt>
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
                      {vi ? "Lý do yêu cầu" : "Reason for request"}
                    </strong>
                    <p>{r.reason}</p>
                  </div>
                  {r.reviewNote && (
                    <div
                      className={`${styles.facts} ${styles.managerResponse}`}
                    >
                      <strong>
                        {vi ? "Phản hồi từ Manager" : "Manager response"}
                      </strong>
                      {r.resolutionType && (
                        <p>{changeTypeLabel(r.resolutionType, vi)}</p>
                      )}
                      <p>{r.reviewNote}</p>
                      {r.reviewedAtUtc && (
                        <p>{formatDateTime(r.reviewedAtUtc)}</p>
                      )}
                    </div>
                  )}
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
                              () => classChangeApi.withdraw(r.requestId),
                              vi ? "Đã rút yêu cầu." : "Request withdrawn.",
                            )
                          ) {
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
