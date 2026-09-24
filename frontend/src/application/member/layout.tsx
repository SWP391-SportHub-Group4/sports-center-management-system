"use client";
import { useState, type ReactNode } from "react";
import { createDemoRepository } from "@/infrastructure/demo/member-repository";
import { RoleShell, type NavigationItem } from "@/shared/ui/role-shell";
import { MemberProvider, useMember } from "./provider";

const navigation: NavigationItem[] = [
  { href: "/member", label: "Homepage", icon: "home" },
  {
    href: "/member/calendar",
    label: "Schedule",
    shortLabel: "Schedule",
    icon: "calendar",
  },
  {
    href: "/member/coaches",
    label: "Coach",
    shortLabel: "HLV",
    icon: "coach",
  },
];
function Shell({ children }: { children: ReactNode }) {
  const { data } = useMember();
  return (
    <RoleShell
      name={data.profile.fullName}
      navigation={navigation}
      profileHref="/member/profile"
      notificationsHref="/member/notifications"
      unread={data.notifications.filter((n) => !n.read).length}
      roleLabel="Members"
      statusLabel="Preview · Illustrated Data"
      avatarSrc="/sporthub/avatar.png"
    >
      {children}
    </RoleShell>
  );
}
export function MemberLayout({ children }: { children: ReactNode }) {
  const [repository] = useState(createDemoRepository);
  return (
    <MemberProvider repository={repository}>
      <Shell>{children}</Shell>
    </MemberProvider>
  );
}
