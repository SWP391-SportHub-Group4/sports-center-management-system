"use client";
import { OperationsPage } from "@/features/operations/ui";
import { CoachesManager } from "@/features/coaches/coaches-manager";
export default function Page() {
  return (
    <OperationsPage title="coaches">
      <CoachesManager />
    </OperationsPage>
  );
}
