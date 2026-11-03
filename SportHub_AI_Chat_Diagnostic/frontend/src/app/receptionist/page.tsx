"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { ReceptionDashboard } from "@/features/receptionist/dashboard";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.frontDesk.pageDesk} allow={["Receptionist"]}>
      <ReceptionDashboard />
    </AppShell>
  );
}
