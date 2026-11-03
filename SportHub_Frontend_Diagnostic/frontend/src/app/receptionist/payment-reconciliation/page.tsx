"use client";

import { AppShell } from "@/components/AppShell";
import { FrontDeskPaymentReconciliation } from "@/features/receptionist/payment-reconciliation";

export default function Page() {
  return (
    <AppShell
      title="Payment and service reconciliation"
      allow={["Receptionist"]}
      operationalLayout
    >
      <FrontDeskPaymentReconciliation />
    </AppShell>
  );
}
