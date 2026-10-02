"use client";
import { Suspense } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { Loading } from "@/components/ui";
import { ExternalWallet } from "@/features/rentals/external-portal";
export default function Page() {
  return (
    <OperationsPage title="wallet" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <ExternalWallet />
      </Suspense>
    </OperationsPage>
  );
}
