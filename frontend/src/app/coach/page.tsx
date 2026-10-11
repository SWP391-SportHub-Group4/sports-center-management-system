"use client";
import { PtPage } from "@/features/pt/ui";
import { CoachOverview } from "@/features/pt/coach-classes";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";
export default function Page() {
  return (
    <CoachWorkspaceRoute
      mode="schedule"
      pt={
        <PtPage title="overview">
          <CoachOverview />
        </PtPage>
      }
    />
  );
}
