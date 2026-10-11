"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { ManagerMemberList } from "@/features/pt/manager-members";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.ptOps.members} allow={["CenterManager"]}>
      <ManagerMemberList />
    </AppShell>
  );
}
