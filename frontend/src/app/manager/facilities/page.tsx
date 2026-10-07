"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { Facilities } from "@/features/manager/facilities";
export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell
      title={t.managerOperations.facilities}
      allow={["CenterManager"]}
      operationalLayout
    >
      <div className="stack">
        <Facilities />
      </div>
    </AppShell>
  );
}
