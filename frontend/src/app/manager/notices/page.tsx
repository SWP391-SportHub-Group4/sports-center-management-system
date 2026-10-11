"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManualNoticeForm } from "@/features/incidents/manual-notice-form";
import { ReceiptLookup } from "@/features/manager/receipt-lookup";
import { ApiGap } from "@/features/manager/api-gap";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <OperationsPage title="notices">
      <ApiGap code="G07" message={t.managerOperations.noticeGap} />
      <ManualNoticeForm />
      <ReceiptLookup kind="notices" />
    </OperationsPage>
  );
}
