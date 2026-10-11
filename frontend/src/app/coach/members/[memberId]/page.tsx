"use client";

import { useParams } from "next/navigation";
import { PtPage } from "@/features/pt/ui";
import { CoachMemberDetail } from "@/features/pt/member-detail";
import { CoachWorkspaceRoute } from "@/features/pt/coach-workspace-route";

export default function Page() {
  const { memberId } = useParams<{
    memberId: string;
  }>();

  return (
    <CoachWorkspaceRoute
      mode="students"
      pt={
        <PtPage title="members">
          <CoachMemberDetail key={memberId} memberId={memberId} />
        </PtPage>
      }
    />
  );
}
