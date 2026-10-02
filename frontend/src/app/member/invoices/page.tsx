"use client";
import { MemberShell } from "@/components/MemberShell";
import { InvoiceList } from "@/features/payments/invoice-list";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.refactor.invoices}>
      <InvoiceList />
    </MemberShell>
  );
}
