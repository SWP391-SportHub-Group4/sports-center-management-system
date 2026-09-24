"use client";

import { AppShell } from "@/components/AppShell";
import { InvoiceWorkbench } from "@/components/InvoiceWorkbench";

export default function ReceptionInvoicesPage() {
  return (
    <AppShell
      title="Search the invoices"
      description="Retrieved and set a request for adjustments for the issued invoice"
      allow={["Receptionist", "CenterManager"]}
    >
      <InvoiceWorkbench />
    </AppShell>
  );
}
