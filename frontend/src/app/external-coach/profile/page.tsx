"use client";
import { Suspense } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { Loading } from "@/components/ui";
import { ExternalProfile } from "@/features/rentals/external-portal";
export default function Page() {
  return (
    <OperationsPage title="profile" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <ExternalProfile />
      </Suspense>
    </OperationsPage>
  );
}
