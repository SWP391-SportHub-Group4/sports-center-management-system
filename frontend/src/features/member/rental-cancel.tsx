"use client";

import { Dialog } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { useLanguage } from "@/lib/language";
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
            disabled={mutation.busy}
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
      <p className={styles.policy} data-refund="no" role="alert">
        {m.cancelLate}
      </p>
      <MutationFeedback mutation={mutation} />
    </Dialog>
  );
}
