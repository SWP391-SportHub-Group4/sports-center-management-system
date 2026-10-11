"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { SalesDesk } from "@/features/receptionist/sales";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.frontDesk.pageSales} allow={["Receptionist"]}>
      <Suspense fallback={<Loading />}>
        <SalesDesk />
      </Suspense>
    </AppShell>
  );
}
