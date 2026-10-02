"use client";
import { OperationsPage } from "@/features/operations/ui";
import { CourtRateEditor } from "@/features/catalog/court-rate-editor";
export default function Page() {
  return (
    <OperationsPage title="rates">
      <CourtRateEditor />
    </OperationsPage>
  );
}
