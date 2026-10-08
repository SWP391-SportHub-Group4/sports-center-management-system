"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { Reports } from "@/features/reports/reports";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.staffWork.reports} allow={["CenterManager"]}>
      <Suspense fallback={<Loading />}>
        <Reports />
      </Suspense>
    </AppShell>
  );
}
