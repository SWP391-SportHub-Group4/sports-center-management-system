"use client";

import { OperationsPage } from "@/features/operations/ui";
import { FrontDeskPaymentReconciliation } from "@/features/receptionist/payment-reconciliation";

export default function Page() {
  return <OperationsPage title="invoices" roles={["Receptionist"]}>
    <FrontDeskPaymentReconciliation />
  </OperationsPage>;
}
