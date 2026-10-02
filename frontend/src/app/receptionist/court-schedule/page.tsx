"use client";
import { OperationsPage } from "@/features/operations/ui";
import { CourtCalendar } from "@/features/court-schedule/court-calendar";
export default function Page() {
  return (
    <OperationsPage title="courtSchedule" roles={["Receptionist"]}>
      <CourtCalendar />
    </OperationsPage>
  );
}
