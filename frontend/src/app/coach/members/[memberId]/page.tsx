"use client";

import { useParams } from "next/navigation";
import { PtPage } from "@/features/pt/ui";
import { PtStudentProfilePage } from "@/features/pt/pt-students-page";
import { CoachStudentProfile } from "@/features/pt/coach-students";
import { useAuth } from "@/lib/auth";
import { canUsePtFeatures } from "@/lib/permissions";

export default function Page() {
  const { user } = useAuth();
  const { memberId } = useParams<{
    memberId: string;
  }>();

  return (
    <>
      {canUsePtFeatures(user) ? (
        <PtPage title="members">
          <PtStudentProfilePage key={memberId} memberId={memberId} />
        </PtPage>
      ) : (
        <PtPage title="members">
          <CoachStudentProfile key={memberId} memberId={memberId} />
        </PtPage>
      )}
    </>
  );
}
