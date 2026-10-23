"use client";

import { AppShell } from "@/components/AppShell";
import { SupportQueue } from "@/features/receptionist";

export default function CoachSupportPage() {
  return (
    <AppShell title="Support requests" allow={["Coach"]}>
      <SupportQueue workspace="coach" />
    </AppShell>
  );
}
