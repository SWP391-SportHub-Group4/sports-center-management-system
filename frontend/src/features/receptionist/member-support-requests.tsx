"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { StatusChip } from "@/components/ui";
import type { MemberSupportRequestDto } from "@/lib/types";

import {
  SupportRequestActions,
  type SupportAssignee,
  type SupportFeedback,
} from "./support-request-actions";
import styles from "./support.module.css";

type Category = MemberSupportRequestDto["category"];

/** Chip chọn nhanh; mã gửi lên vẫn là danh mục của API. */
const CHIPS: { value: Category; en: string; vi: string }[] = [
  { value: "MEMBERSHIP", en: "Check-in issue", vi: "Lỗi check-in" },
  { value: "GENERAL", en: "Locker request", vi: "Yêu cầu tủ đồ" },
  { value: "CLASS", en: "Class", vi: "Lớp học" },
  { value: "PAYMENT", en: "Payment query", vi: "Thanh toán" },
  { value: "OTHER", en: "Feedback / incident", vi: "Góp ý / sự cố" },
];

const RECENT_LIMIT = 5;

export function MemberSupportRequests({ memberId }: { memberId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const assignees = useApi(
    (signal) =>
      api.get<SupportAssignee[]>("/api/member-support-requests/assignees", {
        signal,
      }),
    [],
  );
  const requests = useApi(
    (signal) =>
      api.get<MemberSupportRequestDto[]>("/api/member-support-requests", {
        signal,
        query: { memberId },
      }),
    [memberId],
  );

  // Tải lại sau mỗi thao tác không được làm danh sách và thông báo biến mất.
  const [shown, setShown] = useState<MemberSupportRequestDto[] | null>(null);
  const [notices, setNotices] = useState<Record<string, SupportFeedback | null>>(
    {},
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requests.data) setShown(requests.data);
  }, [requests.data]);

  const [category, setCategory] = useState<Category>("MEMBERSHIP");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const ready = subject.trim().length >= 3 && description.trim().length >= 3;
  const recent = [...(shown ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);

  const categoryLabel = (value: string) => {
    const chip = CHIPS.find((c) => c.value === value);
    if (chip) return vi ? chip.vi : chip.en;
    return value;
  };

  async function submit() {
    if (!ready) {
      setError(
        vi
          ? "Tiêu đề và mô tả cần ít nhất 3 ký tự."
          : "Subject and description must contain at least 3 characters.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post("/api/member-support-requests", {
        memberId,
        category,
        subject: subject.trim(),
        description: description.trim(),
      });
      setSubject("");
      setDescription("");
      setSuccess(
        vi
          ? "Đã ghi nhận yêu cầu hỗ trợ."
          : "Support request recorded successfully.",
      );
      requests.reload();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : vi
            ? "Không thể ghi nhận yêu cầu."
            : "Unable to record support request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={styles.panel}
      aria-label={vi ? "Yêu cầu hỗ trợ của hội viên" : "Member support requests"}
    >
      <div className={styles.head}>
        <h3>{vi ? "Hỗ trợ hội viên" : "Member support"}</h3>
        <p>
          {vi
            ? "Ghi lại yêu cầu mà hội viên đang chọn báo tại quầy."
            : "Record a request the selected member raised at the desk."}
        </p>
      </div>

      <div className={styles.form}>
        <fieldset className={styles.chips}>
          <legend>{vi ? "Loại yêu cầu" : "Request type"}</legend>
          {CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={styles.chip}
              aria-pressed={category === chip.value}
              disabled={busy}
              onClick={() => setCategory(chip.value)}
            >
              {vi ? chip.vi : chip.en}
            </button>
          ))}
        </fieldset>

        <label className={styles.field}>
          {vi ? "Tiêu đề" : "Subject"}
          <input
            value={subject}
            maxLength={200}
            disabled={busy}
            placeholder={vi ? "Tóm tắt ngắn" : "Short summary"}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          {vi ? "Mô tả" : "Description"}
          <textarea
            rows={3}
            maxLength={2000}
            value={description}
            disabled={busy}
            placeholder={
              vi ? "Hội viên cần hỗ trợ điều gì?" : "What does the member need?"
            }
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className={styles.counter}>{description.length}/2000</span>
        </label>

        <div className={styles.submitRow}>
          <button
            type="button"
            className="btn"
            disabled={busy || !ready}
            onClick={submit}
          >
            {busy
              ? vi
                ? "Đang ghi nhận…"
                : "Recording…"
              : vi
                ? "Ghi nhận yêu cầu"
                : "Record support request"}
          </button>
        </div>

        {error && (
          <p className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className={styles.feedback} role="status">
            {success}
          </p>
        )}
      </div>

      <div className={styles.recent}>
        <div className={styles.recentHead}>
          <h4>{vi ? "Yêu cầu gần đây" : "Recent requests"}</h4>
          {(shown?.length ?? 0) > RECENT_LIMIT && (
            <span>
              {vi
                ? `${RECENT_LIMIT} mới nhất trên ${shown?.length}`
                : `Latest ${RECENT_LIMIT} of ${shown?.length}`}
            </span>
          )}
        </div>

        {requests.loading && !shown ? (
          <p className={styles.empty}>{vi ? "Đang tải…" : "Loading…"}</p>
        ) : requests.error ? (
          <p role="alert">{requests.error.message}</p>
        ) : !recent.length ? (
          <p className={styles.empty}>
            {vi
              ? "Chưa có yêu cầu hỗ trợ nào."
              : "No support requests recorded."}
          </p>
        ) : (
          <ul className={styles.requests}>
            {recent.map((request) => (
              <li key={request.requestId} className={styles.request}>
                <div className={styles.requestTop}>
                  <strong>{request.subject}</strong>
                  <StatusChip value={request.status} />
                </div>
                <p className={styles.meta}>
                  {categoryLabel(request.category)} ·{" "}
                  {formatDateTime(request.createdAt)}
                </p>
                <p className={styles.body}>{request.description}</p>
                <SupportRequestActions
                  request={request}
                  assignees={assignees.data ?? []}
                  feedback={notices[request.requestId] ?? null}
                  onFeedback={(next) =>
                    setNotices((all) => ({ ...all, [request.requestId]: next }))
                  }
                  onChanged={requests.reload}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
