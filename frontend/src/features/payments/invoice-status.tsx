"use client";
import { useLanguage } from "@/lib/language";
import { StatusChip } from "@/components/ui";
import type { CheckoutDto } from "@/lib/types";
export function InvoiceStatus({ checkout }: { checkout: CheckoutDto }) {
  const { t } = useLanguage();
  const l = t.refactor;
  return (
    <>
      <p>
        {l.status}: <StatusChip value={checkout.invoiceStatus} /> ·{" "}
        <StatusChip value={checkout.fulfillmentOutcome} />
      </p>
      <p>
        {checkout.reconciliationRequired
          ? l.reconciliation
          : checkout.fulfillmentOutcome === "COMPENSATED"
            ? l.compensated
            : checkout.invoiceStatus === "PAID" ||
                checkout.invoiceStatus === "PAID_AFTER_RECONCILIATION"
              ? l.paid
              : l.pending}
      </p>
    </>
  );
}
