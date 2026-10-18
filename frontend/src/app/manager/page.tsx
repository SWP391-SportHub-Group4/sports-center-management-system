"use client";
import { PtPage } from "@/features/pt/ui";
import { MonthlyAnalysis } from "@/features/reports/monthly-analysis";
export default function Page() {
  return (
    <PtPage title="overview" manager>
      <MonthlyAnalysis />
    </PtPage>
  );
}
