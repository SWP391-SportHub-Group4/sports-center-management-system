"use client";
import { AppShell } from "@/components/AppShell";
import { useLanguage } from "@/lib/language";
import { MemberList } from "@/features/receptionist/members";

export default function Page() {
  const { t } = useLanguage();
  return (
    <AppShell title={t.frontDesk.pageMembers} allow={["Receptionist"]}>
      <MemberList />
    </AppShell>
  );
}
