"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { ManagerFinance } from "@/features/finance/manager-finance";

export default function Page() {
  return (
    <AppShell title="Invoices" allow={["CenterManager"]}>
      <Suspense fallback={<Loading />}>
        <ManagerFinance />
      </Suspense>
    </AppShell>
  );
}
