"use client";
import { useParams } from "next/navigation";
import { MemberShell } from "@/components/MemberShell";
import { MemberInvoiceDetail } from "@/features/payments";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  return (
    <MemberShell title={t.finance.invoiceTitle}>
      <MemberInvoiceDetail key={id} invoiceId={id} />
    </MemberShell>
  );
}
