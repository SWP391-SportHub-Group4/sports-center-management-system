"use client";

import { AppShell } from "@/components/AppShell";
import { AuditLogView } from "@/components/AuditLogView";

export default function ManagerAuditPage() {
  return (
    <AppShell
      title="Nhật ký thao tác"
      description="Ai làm gì, trên đối tượng nào, vào lúc nào (BR-7)"
      allow={["CenterManager"]}
    >
      <AuditLogView />
    </AppShell>
  );
}
