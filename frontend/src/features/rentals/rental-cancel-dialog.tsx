"use client";
import Link from "next/link";
import { AsyncSection, Dialog } from "@/components/ui";
import { bankRefundHref } from "@/lib/bank-refund";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatPoints } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import { paymentApi } from "@/features/payments";
import { rentalApi } from "./api";
import type { CourtRentalDto } from "@/lib/types";
export function RentalCancelDialog({
  rental,
  onClose,
  onSaved,
}: {
  rental: CourtRentalDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const l = t.operations;
  const mutation = useMutation();
  const quote = useApi(
    (s) =>
      rental.invoiceItemId
        ? paymentApi.refundQuote(rental.invoiceItemId, s)
        : Promise.resolve(null),
    [rental.invoiceItemId],
  );
  return (
    <Dialog title={l.cancelRental} onClose={() => !mutation.busy && onClose()}>
      <p>{l.rentalPolicy}</p>
      <AsyncSection state={quote}>
        {(data) => (
          <>
            <p>
              {l.refundPoints}: {formatPoints(data.systemCalculatedPoints)}
            </p>
            <button
              className="btn"
              disabled={mutation.busy}
              onClick={async () => {
                if (
                  await mutation.run(() =>
                    rentalApi.cancel(rental.courtRentalId),
                  )
                )
                  onSaved();
                else quote.reload();
              }}
            >
              {l.confirm}
            </button>
          </>
        )}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
      {rental.invoiceItemId && (
        <p>
          <strong>
            {vi
              ? "Hoặc yêu cầu hoàn tiền về tài khoản ngân hàng: "
              : "Or ask for a refund to your bank account: "}
          </strong>
          <Link href={bankRefundHref(rental.invoiceItemId)}>
            {vi ? "Gửi yêu cầu hoàn tiền" : "Request a bank refund"}
          </Link>
          {vi
            ? " (Manager sẽ xem xét; chưa hủy hay hoàn gì cho đến khi được duyệt)."
            : " (a manager reviews it; nothing is cancelled or returned until approved)."}
        </p>
      )}
    </Dialog>
  );
}
