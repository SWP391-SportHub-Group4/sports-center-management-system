"use client";

import { AppShell } from "@/components/AppShell";
import { InvoiceWorkbench } from "@/components/InvoiceWorkbench";

export default function ReceptionInvoicesPage() {
  return (
    <AppShell
      title="Tra cứu hóa đơn"
      description="Thu tiền và lập yêu cầu điều chỉnh cho hóa đơn đã phát hành"
      allow={["Receptionist", "CenterManager"]}
    >
      <InvoiceWorkbench />
    </AppShell>
  );
}
