"use client";

import { PtPage } from "@/features/pt/ui";
import { CoachClasses } from "@/features/pt/coach-classes";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";

export default function CoachClassesPage() {
  return (
    <CoachWorkspaceRoute
      mode="classes"
      pt={
        <PtPage title="classes">
          <CoachClasses />
        </PtPage>
      }
    />
  );
}
