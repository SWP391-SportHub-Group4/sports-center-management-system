"use client";
import { OperationsPage } from "@/features/operations/ui";
import { IncidentWorkspace } from "@/features/incidents/incident-history";
export default function Page() {
  return (
    <OperationsPage title="incidents">
      <IncidentWorkspace />
    </OperationsPage>
  );
}
