"use client";
import { AppShell } from "@/components/AppShell";
import { MonthlyAnalysis } from "@/features/reports/monthly-analysis";
export default function Page() {
  return (
    <AppShell
      title="Overview"
      allow={["CenterManager"]}
      operationalLayout
      hidePageHeader
    >
      <MonthlyAnalysis />
    </AppShell>
  );
}
