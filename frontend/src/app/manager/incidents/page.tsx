"use client";
import { OperationsPage } from "@/features/operations/ui";
import { IncidentForm } from "@/features/incidents/incident-form";
export default function Page() {
  return (
    <OperationsPage title="incidents">
      <IncidentForm />
    </OperationsPage>
  );
}
