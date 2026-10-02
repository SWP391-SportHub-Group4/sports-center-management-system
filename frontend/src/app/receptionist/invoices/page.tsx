"use client";
import { OperationsPage } from "@/features/operations/ui";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { InvoiceDesk } from "@/features/receptionist/invoice-desk";
export default function Page() {
  return (
    <OperationsPage title="invoices" roles={["Receptionist"]}>
      <Suspense fallback={<Loading />}>
        <InvoiceDesk />
      </Suspense>
    </OperationsPage>
  );
}
