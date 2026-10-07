"use client";
import { AppShell } from "@/components/AppShell";
import { AdminOverview } from "@/features/administration/overview";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.adminWork.overviewTitle}
      description={t.adminWork.overviewHint}
      allow={["SystemAdministrator"]}
      operationalLayout
    >
      <AdminOverview />
    </AppShell>
  );
}
