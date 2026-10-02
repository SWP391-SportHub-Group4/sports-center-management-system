"use client";
import { Suspense } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { Loading } from "@/components/ui";
import { ExternalDashboard } from "@/features/rentals/external-portal";
export default function Page() {
  return (
    <OperationsPage title="dashboard" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <ExternalDashboard />
      </Suspense>
    </OperationsPage>
  );
}
