"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManualNoticeForm } from "@/features/incidents/manual-notice-form";
import { ReceiptLookup } from "@/features/manager/receipt-lookup";
export default function Page() {
  return (
    <OperationsPage title="notices">
      <ManualNoticeForm />
      <ReceiptLookup kind="notices" />
    </OperationsPage>
  );
}
