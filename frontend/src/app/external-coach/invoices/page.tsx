"use client";
import { Suspense } from "react";
import { OperationsPage } from "@/features/operations/ui";
import { Loading } from "@/components/ui";
import { ExternalInvoices } from "@/features/rentals/external-portal";
export default function Page() {
  return (
    <OperationsPage title="invoices" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <ExternalInvoices />
      </Suspense>
    </OperationsPage>
  );
}
