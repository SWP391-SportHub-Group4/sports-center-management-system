"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ExternalCoachReview } from "@/features/coaches/external-coach-review";
export default function Page() {
  return (
    <OperationsPage title="externalCoaches">
      <ExternalCoachReview />
    </OperationsPage>
  );
}
