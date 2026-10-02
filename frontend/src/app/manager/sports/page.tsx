"use client";
import { OperationsPage } from "@/features/operations/ui";
import { SportsManager } from "@/features/catalog/sports-manager";
export default function Page() {
  return (
    <OperationsPage title="sports">
      <SportsManager />
    </OperationsPage>
  );
}
