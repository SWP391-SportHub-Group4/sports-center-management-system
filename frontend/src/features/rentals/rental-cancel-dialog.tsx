"use client";
import { Dialog } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
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
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  return (
    <Dialog title={l.cancelRental} onClose={() => !mutation.busy && onClose()}>
      <p>{l.rentalPolicy}</p>
      <button
        className="btn"
        disabled={mutation.busy}
        onClick={async () => {
          if (await mutation.run(() => rentalApi.cancel(rental.courtRentalId)))
            onSaved();
        }}
      >
        {l.confirm}
      </button>
      <MutationFeedback mutation={mutation} />
    </Dialog>
  );
}
