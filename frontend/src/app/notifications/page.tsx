"use client";
import { MemberShell } from "@/components/MemberShell";
import { AppShell } from "@/components/AppShell";
import { MemberNotifications } from "@/features/member/notifications";
import { useAuth } from "@/lib/auth";
export default function Page() {
  const { user } = useAuth();
  return user?.role === "Member" ? (
    <MemberShell title="Inbox">
      <MemberNotifications key={user.userId} />
    </MemberShell>
  ) : (
    <AppShell
      title="Inbox"
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
