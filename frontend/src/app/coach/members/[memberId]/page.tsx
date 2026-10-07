"use client";

import { useParams } from "next/navigation";
import { PtPage } from "@/features/pt/ui";
import { CoachMemberDetail } from "@/features/pt/member-detail";

export default function Page() {
  const { memberId } =
    useParams<{
      memberId: string;
    }>();

  return (
    <PtPage title="members">
      <CoachMemberDetail
        key={memberId}
        memberId={memberId}
      />
    </PtPage>
  );
}