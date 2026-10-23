"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui";
import { bankRefundHref } from "@/lib/bank-refund";
import { MutationFeedback, useMutation } from "@/features/operations";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { rentalApi } from "../rentals/api";
import { api } from "@/lib/apiClient";
import type { CourtRentalDto } from "@/lib/types";
import styles from "./schedule.module.css";

/** Xác nhận hủy lượt thuê sân ngay trong ngăn chi tiết; máy chủ vẫn là nơi quyết định hoàn điểm. */
export function RentalCancelConfirm({
  rental,
  onClose,
  onCancelled,
  onBehalf = false,
}: {
  rental: CourtRentalDto;
  onClose: () => void;
  onCancelled: () => void;
  onBehalf?: boolean;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const m = t.mSchedule;
  const mutation = useMutation();
  const policy = useApi(async (signal) => {
    const value = await rentalApi.policy(signal);
    return { ...value, receivedAtMs: Date.now() };
  }, []);
  const hours = policy.data?.cancelFreeHours ?? 24;
  const clock = useNow(1_000);
  const now = policy.data
    ? clock + Date.parse(policy.data.serverNowUtc) - policy.data.receivedAtMs
    : clock;
  const free = new Date(rental.startAtUtc).getTime() - now >= hours * 3_600_000;
  return (
    <Dialog
      title={m.cancelTitle}
      size="sm"
      closeIconOnly
      onClose={() => !mutation.busy && onClose()}
      footer={
        <>
          <button
            type="button"
            className={`btn btn--danger ${styles.footStart}`}
            disabled={mutation.busy || policy.loading}
            onClick={async () => {
              if (
                await mutation.run(
                  () =>
                    onBehalf
                      ? api.post(
                          `/api/court-rentals/${rental.courtRentalId}/cancel-on-behalf`,
                          {},
                        )
                      : rentalApi.cancel(rental.courtRentalId),
                  m.cancelDone,
                )
              )
                onCancelled();
            }}
          >
            {m.cancelConfirm}
          </button>
        </>
      }
    >
      <p className={styles.policy} data-refund={free ? "yes" : "no"}>
        {(free ? m.cancelFree : m.cancelLate).replace("{hours}", String(hours))}
      </p>
      <MutationFeedback mutation={mutation} />
      {!onBehalf && rental.invoiceItemId && (
        <div className={styles.bankChoice}>
          <strong>
            {vi
              ? "Hoặc yêu cầu hoàn tiền về tài khoản ngân hàng"
              : "Or request a refund to your bank account"}
          </strong>
          <p>
            {vi
              ? "Gửi yêu cầu để Manager xem xét. Lượt thuê chưa bị hủy và chưa hoàn điểm hay tiền cho đến khi Manager duyệt."
              : "A manager reviews the request. Your booking is not cancelled and no points or money are returned until a manager approves it."}
          </p>
          <Link
            className="btn btn--secondary"
            href={bankRefundHref(rental.invoiceItemId)}
          >
            {vi ? "Gửi yêu cầu hoàn tiền" : "Request a bank refund"}
          </Link>
        </div>
      )}
    </Dialog>
  );
}
