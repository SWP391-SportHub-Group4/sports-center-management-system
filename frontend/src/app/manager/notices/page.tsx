"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ManualNoticeForm } from "@/features/incidents/manual-notice-form";
export default function Page() {
  return (
    <OperationsPage title="notices">
      <ManualNoticeForm />
    </OperationsPage>
  );
}
