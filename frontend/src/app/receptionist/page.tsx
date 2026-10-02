"use client";
import { OperationsPage } from "@/features/operations/ui";
import { ReceptionDashboard } from "@/features/receptionist/front-desk";
export default function Page() {
  return (
    <OperationsPage title="dashboard" roles={["Receptionist"]}>
      <ReceptionDashboard />
    </OperationsPage>
  );
}
