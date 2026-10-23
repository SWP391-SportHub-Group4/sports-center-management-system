"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { formatDate, formatPoints } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useAction, useApi, useNow } from "@/lib/useApi";
import styles from "./refund-cancel-dialog.module.css";

/** Mốc hoàn đủ khớp backend: từ 5 ngày trở lên trước buổi đầu hoàn 100%, muộn hơn nhưng chưa khai giảng hoàn 50%. */
const FULL_REFUND_MS = 5 * 86_400_000;

export interface RefundCancelTarget {
  kind: "class" | "gym";
  name: string;
  /** Mã dòng hóa đơn của quyền lợi cần hủy. */
  itemId: string | null;
  /** Lớp: giờ buổi đầu, để chọn mốc 100% hoặc 50%. */
  firstSessionStartUtc?: string | null;
  /** Lớp: đã bắt đầu thì không hoàn tự động, chỉ gửi đơn cho Manager. */
  started?: boolean;
  /** Gym: ngày hết hạn của gói, chỉ để hiển thị. */
  endDate?: string | null;
}

/**
 * Hủy quyền lợi đã mua và hoàn điểm theo quy tắc. Dùng cho Member tự hủy và cho Lễ tân hủy thay
 * (onBehalf). Hoàn chỉ bằng điểm, không hoàn tiền mặt.
 */
export function RefundCancelDialog({
  target,
  onBehalf = false,
  onClose,
  onDone,
}: {
  target: RefundCancelTarget;
  onBehalf?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const now = useNow();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { kind, itemId, started = false } = target;
  const quote = useApi(
    (signal) =>
      itemId && !started
        ? api.get<{ systemCalculatedPoints: number }>(
            `/api/refunds/quote/${itemId}`,
            { signal },
          )
        : Promise.resolve(null),
    [itemId, started],
  );
  const points = quote.data?.systemCalculatedPoints;
  const untilStart = target.firstSessionStartUtc
    ? new Date(target.firstSessionStartUtc).getTime() - now
    : 0;
  const percent = untilStart >= FULL_REFUND_MS ? 100 : 50;
  const noRefund = kind === "gym" && points === 0;
  const endpoint =
    kind === "gym"
      ? "/api/refunds/membership-cancellations"
      : "/api/refunds/class-cancellations";

  async function cancel() {
    if (!itemId) return;
    const done = await action.run(() =>
      api.post<{ approvedPoints?: number }>(endpoint, {
        invoiceItemId: itemId,
      }),
    );
    if (!done) return;
    const returned = formatPoints(done.approvedPoints ?? points ?? 0);
    const message = onBehalf
      ? tx(
          `Đã hủy thay hội viên. ${returned} điểm đã được hoàn vào ví của họ.`,
          `Cancelled for the member. ${returned} points went back to their wallet.`,
        )
      : tx(
          `Đã hủy. ${returned} điểm đã được hoàn vào ví.`,
          `Cancelled. ${returned} points were returned to your wallet.`,
        );
    setResult(message);
    onDone(message);
  }

  async function request() {
    if (!itemId) return;
    const done = await action.run(() =>
      api.post("/api/refunds", {
        invoiceItemId: itemId,
        reason: reason.trim(),
      }),
    );
    if (!done) return;
    const message = tx(
      "Đã gửi đơn. Manager sẽ xem xét và quyết định mức hoàn.",
      "Request sent. A manager will review it and decide the refund.",
    );
    setResult(message);
    onDone(message);
  }

  const title = started
    ? tx("Gửi đơn hoàn điểm", "Request a refund")
    : kind === "gym"
      ? tx("Hủy gói Gym", "Cancel Gym membership")
      : tx("Hủy ghi danh lớp", "Cancel class enrollment");

  return (
    <Dialog title={title} size="sm" onClose={onClose} closeIconOnly>
      <div className={styles.body}>
        <p className={styles.name}>{target.name}</p>
        {result ? (
          <>
            <p className="alert alert--success" role="status">
              {result}
            </p>
            <button type="button" className="btn" onClick={onClose}>
              {tx("Đóng", "Close")}
            </button>
          </>
        ) : started ? (
          <>
            <p>
              {tx(
                "Lớp đã bắt đầu nên không hoàn tự động. Nếu có lý do chính đáng (ví dụ chất lượng giảng dạy), hãy gửi đơn để Manager quyết định mức hoàn.",
                "The class has started, so no automatic refund applies. If you have a valid reason, such as teaching quality, send a request and a manager will decide.",
              )}
            </p>
            <label className={styles.field}>
              <span>{tx("Lý do", "Reason")}</span>
              <textarea
                rows={4}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {action.error && <p role="alert">{action.error}</p>}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn"
                disabled={action.busy || reason.trim().length < 3}
                onClick={request}
              >
                {tx("Gửi đơn", "Send request")}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={onClose}
              >
                {tx("Đóng", "Close")}
              </button>
            </div>
          </>
        ) : (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>
                  {kind === "gym"
                    ? tx("Hết hạn", "Ends")
                    : tx("Buổi đầu", "First session")}
                </dt>
                <dd>
                  {formatDate(
                    kind === "gym"
                      ? target.endDate
                      : target.firstSessionStartUtc,
                  )}
                </dd>
              </div>
              <div>
                <dt>{tx("Mức hoàn", "Refund rate")}</dt>
                <dd>
                  {quote.loading || quote.error || points === undefined
                    ? "—"
                    : kind === "gym"
                      ? noRefund
                        ? "0%"
                        : "50%"
                      : `${percent}%`}
                </dd>
              </div>
              <div>
                <dt>{tx("Điểm được hoàn", "Points returned")}</dt>
                <dd>{points === undefined ? "—" : formatPoints(points)}</dd>
              </div>
            </dl>
            <p className={styles.hint}>
              {kind === "gym"
                ? t.finOps.membershipRefundPolicy
                : percent === 100
                  ? tx(
                      "Hủy từ 5 ngày trở lên trước buổi đầu được hoàn 100%.",
                      "Cancelling 5 or more days before the first session returns 100%.",
                    )
                  : tx(
                      "Còn dưới 5 ngày tới buổi đầu nên chỉ hoàn 50%. Điểm hoàn vào ví, không hoàn tiền mặt.",
                      "Fewer than 5 days remain, so only 50% is returned. Refunds go to the wallet as points, never cash.",
                    )}
            </p>
            {quote.error && (
              <p className="alert alert--error" role="alert">
                {quote.error instanceof ApiError &&
                quote.error.code === "refund_entitlement_not_found"
                  ? tx(
                      "Không tìm thấy quyền ghi danh hợp lệ để tính hoàn điểm. Chưa hủy lớp. Hãy tải lại hồ sơ hội viên; nếu vẫn gặp lỗi, nhờ Manager kiểm tra dữ liệu lớp và hóa đơn.",
                      "The class enrollment or its sessions could not be matched to this invoice. Nothing was cancelled. Refresh the member profile; if this persists, ask a manager to check the class and invoice data.",
                    )
                  : quote.error.message}
              </p>
            )}
            {action.error && <p role="alert">{action.error}</p>}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn--danger"
                disabled={
                  action.busy ||
                  quote.loading ||
                  !!quote.error ||
                  !quote.data ||
                  noRefund
                }
                onClick={cancel}
              >
                {tx("Xác nhận hủy", "Confirm cancellation")}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
