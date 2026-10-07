"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { ReportExports } from "@/features/reports/reports";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.finOps.exportsTitle} allow={["CenterManager"]}>
      <ReportExports />
    </AppShell>
  );
}
