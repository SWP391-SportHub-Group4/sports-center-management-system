"use client";

import { AppShell } from "@/components/AppShell";
import { InvoiceWorkbench } from "@/components/InvoiceWorkbench";
import { useLanguage } from "@/lib/language";

export default function ReceptionInvoicesPage() {
  const { language } = useLanguage();

  return (
    <AppShell
      title={language === "en" ? "Invoice Lookup & Payments" : "Tra cứu hóa đơn & Thu tiền"}
      description={
        language === "en"
          ? "Look up issued invoices, process payments, and submit adjustment requests"
          : "Tra cứu hóa đơn đã phát hành, ghi nhận thanh toán và gửi yêu cầu điều chỉnh"
      }
      allow={["Receptionist", "CenterManager"]}
    >
      <InvoiceWorkbench />
    </AppShell>
  );
}
