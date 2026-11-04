"use client";
import { MemberShell } from "@/components/MemberShell";
import { AppShell } from "@/components/AppShell";
import { MemberNotifications } from "@/features/member/notifications";
import { useAuth } from "@/lib/auth";
export default function Page() {
  const { user } = useAuth();
  return user?.role === "Member" ? (
    <MemberShell title="Notifications">
      <MemberNotifications key={user.userId} />
    </MemberShell>
  ) : (
    <AppShell
      title="Notifications"
      allow={[
        "Member",
        "Coach",
        "Receptionist",
        "CenterManager",
        "SystemAdministrator",
      ]}
    >
      <MemberNotifications key={user?.userId} />
    </AppShell>
  );
}
