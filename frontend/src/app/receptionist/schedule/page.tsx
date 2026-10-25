"use client";

import { AppShell } from "@/components/AppShell";
import { ReceptionistSchedule } from "@/features/receptionist/receptionist-schedule";

export default function ReceptionistSchedulePage() {
  return (
    <AppShell title="Schedule" allow={["Receptionist"]} operationalLayout>
      <ReceptionistSchedule />
    </AppShell>
  );
}