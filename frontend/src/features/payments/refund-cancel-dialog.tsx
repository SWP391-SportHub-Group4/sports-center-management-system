"use client";

import { Dialog } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useAction } from "@/lib/useApi";
import { useState } from "react";
import styles from "./refund-cancel-dialog.module.css";

export interface RefundCancelTarget {
  kind: "class" | "gym";
  name: string;
  /** Mã dòng hóa đơn của quyền lợi cần hủy. */
  itemId: string | null;
  /** Lớp: giờ buổi đầu, chỉ để hiển thị. */
  firstSessionStartUtc?: string | null;
  /** Giữ để tương thích: lớp đã bắt đầu vẫn hủy được và vẫn không hoàn (BR-122). */
  started?: boolean;
  /** Gym: ngày hết hạn của gói, chỉ để hiển thị. */
  endDate?: string | null;
}

/**
 * Hủy quyền lợi đã mua. Member tự hủy (hoặc Lễ tân/Manager hủy thay theo yêu cầu của Member) thì KHÔNG được hoàn
 * ở mọi thời điểm (BR-91, BR-122). Dialog luôn báo trước, chỉ hủy khi người dùng xác nhận. Mọi yêu cầu hoàn khác
 * chỉ đi qua Support Request.
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
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const action = useAction();
  const [result, setResult] = useState<string | null>(null);
  const { kind, itemId } = target;
  const endpoint =
    kind === "gym"
      ? "/api/refunds/membership-cancellations"
      : "/api/refunds/class-cancellations";

  async function cancel() {
    if (!itemId) return;
    const done = await action.run(() =>
      api.post<{ invoiceItemId: string; refundedPoints: number }>(endpoint, {
        invoiceItemId: itemId,
      }),
    );
    if (!done) return;
    const message = onBehalf
      ? tx(
          "Đã hủy thay hội viên. Không hoàn tiền hay điểm.",
          "Cancelled for the member. No refund was issued.",
        )
      : tx("Đã hủy. Không hoàn tiền hay điểm.", "Cancelled. No refund was issued.");
    setResult(message);
    onDone(message);
  }

  const title =
    kind === "gym"
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
                <dt>{tx("Hoàn tiền / điểm", "Refund")}</dt>
                <dd>{tx("Không hoàn", "No refund")}</dd>
              </div>
            </dl>
            <p className={styles.hint} role="alert">
              {tx(
                "Bạn đang hủy và sẽ không được hoàn tiền hay điểm, ở bất kỳ thời điểm nào. Chỉ khi bạn xác nhận thì việc hủy mới được thực hiện. Nếu cần hỗ trợ thêm, hãy gửi Support Request.",
                "You are cancelling and will not get a refund or points, at any time. Nothing is cancelled until you confirm. If you need further help, send a Support Request.",
              )}
            </p>
            {action.error && <p role="alert">{action.error}</p>}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn--danger"
                disabled={action.busy || !itemId}
                onClick={cancel}
              >
                {tx("Xác nhận hủy", "Confirm cancellation")}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={onClose}
              >
                {tx("Giữ lại", "Keep it")}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
