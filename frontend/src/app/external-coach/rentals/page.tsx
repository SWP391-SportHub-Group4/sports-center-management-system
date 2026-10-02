"use client";
import { Suspense } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { Loading } from "@/components/ui";
import { RentalList } from "@/features/rentals/rental-list";
export default function Page() {
  return (
    <OperationsPage title="rentals" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <RentalList />
      </Suspense>
    </OperationsPage>
  );
}
