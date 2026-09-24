"use client";

import { AppShell } from "@/components/AppShell";
import { AuditLogView } from "@/components/AuditLogView";

export default function AdminAuditPage() {
  return (
    <AppShell
      title="Operations Register"
      description="Collate administrator operations, including key and account unlock (BR-6, BR-7)"
      allow={["SystemAdministrator"]}
    >
      <AuditLogView />
    </AppShell>
  );
}
