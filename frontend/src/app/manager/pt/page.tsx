"use client";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { ManagerPt } from "@/features/pt/manager-pt";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.ptOps.managerTitle} allow={["CenterManager"]}>
      <Suspense fallback={<Loading />}>
        <ManagerPt />
      </Suspense>
    </AppShell>
  );
}
