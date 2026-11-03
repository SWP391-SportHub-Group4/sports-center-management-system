"use client";
import { useSearchParams } from "next/navigation";
import { OperationsPage } from "@/features/operations/ui";
import { IncidentForm } from "@/features/incidents/incident-form";
export default function Page() {
  const params = useSearchParams();
  const formKey = new URLSearchParams(params);
  formKey.delete("incidentUncertain");
  return (
    <OperationsPage title="incidents">
      <IncidentForm key={formKey.toString()} />
    </OperationsPage>
  );
}
