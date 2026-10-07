"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { ManagerSchedule } from "@/features/manager/manager-schedule";
export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.managerOperations.schedule}
      allow={["CenterManager"]}
      operationalLayout
    >
      <div className="stack">
        <ManagerSchedule />
      </div>
    </AppShell>
  );
}
