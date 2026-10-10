"use client";

import { useParams } from "next/navigation";
import { PtPage } from "@/features/pt/ui";
import { CoachClassDetail } from "@/features/pt/coach-classes";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";

export default function Page() {
  const { classId } = useParams<{ classId: string }>();

  return (
    <CoachWorkspaceRoute
      mode="classes"
      initialClassId={Number(classId)}
      pt={
        <PtPage title="classes">
          <CoachClassDetail key={classId} classId={Number(classId)} />
        </PtPage>
      }
    />
  );
}
