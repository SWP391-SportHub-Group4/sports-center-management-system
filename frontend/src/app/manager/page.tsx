"use client";
import { StaffPage } from "@/features/coaching/ui";
import { MonthlyAnalysis } from "@/features/reports/monthly-analysis";
export default function Page() {
  return (
    <StaffPage title="overview" manager>
      <MonthlyAnalysis />
    </StaffPage>
  );
}
