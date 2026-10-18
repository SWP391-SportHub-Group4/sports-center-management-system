"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperationsPage } from "@/features/operations/ui";
import { IncidentForm } from "@/features/incidents/incident-form";
import { IncidentFences } from "@/features/incidents/incident-fences";
export default function Page() {
  const params = useSearchParams();
  const formKey = new URLSearchParams(params);
  formKey.delete("incidentUncertain");
  const [fencesRevision, setFencesRevision] = useState(0);
  return (
    <OperationsPage title="incidents">
      {/* A new query (Continue on a held incident) remounts the form so it starts from that window. */}
      <IncidentForm
        key={formKey.toString()}
        onFencesChanged={() => setFencesRevision((n) => n + 1)}
        aboveForm={<IncidentFences revision={fencesRevision} />}
      />
    </OperationsPage>
  );
}
