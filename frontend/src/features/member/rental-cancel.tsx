"use client";

import { Dialog } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatPoints } from "@/lib/format";
import { paymentApi } from "@/features/payments";
import { rentalApi } from "../rentals/api";
import type { CourtRentalDto } from "@/lib/types";
import styles from "./schedule.module.css";

/** Xác nhận hủy lượt thuê sân ngay trong ngăn chi tiết; máy chủ vẫn là nơi quyết định hoàn điểm. */
export function RentalCancelConfirm({
  rental,
  onClose,
  onCancelled,
}: {
  rental: CourtRentalDto;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { t } = useLanguage();
  const m = t.mSchedule;
  const mutation = useMutation();
  const policy = useApi((signal) => rentalApi.policy(signal), []);
  const hours = policy.data?.cancelFreeHours ?? 24;
  // Số điểm hoàn cuối cùng luôn do server tính; quy tắc 24h chỉ là lời giải thích.
  const quote = useApi(
    (signal) =>
      rental.invoiceItemId
        ? paymentApi.refundQuote(rental.invoiceItemId, signal)
        : Promise.resolve(null),
    [rental.invoiceItemId],
  );
  const clock = useNow();
  const now = policy.data
    ? new Date(policy.data.serverNowUtc).getTime()
    : clock;
  const free = new Date(rental.startAtUtc).getTime() - now >= hours * 3_600_000;
  return (
    <Dialog
      title={m.cancelTitle}
      onClose={() => !mutation.busy && onClose()}
      footer={
        <>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {m.cancelKeep}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={mutation.busy || policy.loading}
            onClick={async () => {
              if (
                await mutation.run(
                  () => rentalApi.cancel(rental.courtRentalId),
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
      {quote.data && (
        <p>
          {t.operations.refundPoints}: {formatPoints(quote.data.systemCalculatedPoints)}
        </p>
      )}
      <MutationFeedback mutation={mutation} />
    </Dialog>
  );
}
