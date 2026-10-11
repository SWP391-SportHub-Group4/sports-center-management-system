"use client";
import { PtPage } from "@/features/pt/ui";
import { CoachMembers } from "@/features/pt/coach-classes";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";
export default function Page() {
  return (
    <CoachWorkspaceRoute
      mode="students"
      pt={
        <PtPage title="members">
          <CoachMembers />
        </PtPage>
      }
    />
  );
}
