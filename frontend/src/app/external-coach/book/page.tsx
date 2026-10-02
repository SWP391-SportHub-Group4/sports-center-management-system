"use client";
import { Suspense } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { Loading } from "@/components/ui";
import { AvailabilityPicker } from "@/features/rentals/availability-picker";
export default function Page() {
  return (
    <OperationsPage title="book" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <AvailabilityPicker />
      </Suspense>
    </OperationsPage>
  );
}
