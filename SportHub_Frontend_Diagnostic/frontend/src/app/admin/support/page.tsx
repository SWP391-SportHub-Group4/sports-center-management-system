"use client";

import { AppShell } from "@/components/AppShell";
import { SupportQueue } from "@/features/receptionist";

export default function AdminSupportPage() {
  return (
    <AppShell
      title="Support requests"
      allow={["SystemAdministrator"]}
      operationalLayout
    >
      <SupportQueue workspace="admin" />
    </AppShell>
  );
}
