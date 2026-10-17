"use client";
import { PtPage } from "@/features/pt/ui";
import {
  ManagementShortcuts,
  ManagerOverview,
} from "@/features/reports/reports";
import { OperationsOverview } from "@/features/manager/operations-overview";
import { OperationsHealthCard } from "@/features/reports/operations-health";
export default function Page() {
  return (
    <PtPage title="overview" manager>
      <ManagementShortcuts />
      <OperationsOverview />
      <OperationsHealthCard />
      <ManagerOverview />
    </PtPage>
  );
}
