"use client";

import { AppShell } from "@/components/AppShell";
import { AuditLogView } from "@/components/AuditLogView";

export default function ManagerAuditPage() {
  return (
    <AppShell
      title="Operations Register"
      description="Who's doing, on the subject, at what time? (BR-7)"
      allow={["CenterManager"]}
    >
      <AuditLogView />
    </AppShell>
  );
}
