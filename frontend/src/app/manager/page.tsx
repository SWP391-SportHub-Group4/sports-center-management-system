"use client";
import { PtPage } from "@/features/pt/ui";
import { ManagerOverview, ManagerQuickLinks } from "@/features/reports/reports";
import { OperationsOverview } from "@/features/manager/operations-overview";
export default function Page() {
  return (
    <PtPage title="overview" manager>
      <ManagerQuickLinks />
      <OperationsOverview />
      <ManagerOverview />
    </PtPage>
  );
}
