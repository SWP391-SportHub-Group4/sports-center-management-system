"use client";
import { MemberShell } from "@/components/MemberShell";
import { AppShell } from "@/components/AppShell";
import { MemberNotifications } from "@/features/member/notifications";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
export default function Page() {
  const { t } = useLanguage();
  const { user } = useAuth();
  return user?.role === "Member" ? (
    <MemberShell title={t.refactor.notifications}>
      <MemberNotifications />
    </MemberShell>
  ) : (
    <AppShell
      title={t.refactor.notifications}
      allow={[
        "Member",
        "Coach",
        "Receptionist",
        "CenterManager",
        "SystemAdministrator",
      ]}
    >
      <MemberNotifications />
    </AppShell>
  );
}
