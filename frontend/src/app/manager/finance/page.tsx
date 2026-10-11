"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { ManagerFinance } from "@/features/finance/manager-finance";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.finOps.financeTitle} allow={["CenterManager"]}>
      <Suspense fallback={<Loading />}>
        <ManagerFinance />
      </Suspense>
    </AppShell>
  );
}
