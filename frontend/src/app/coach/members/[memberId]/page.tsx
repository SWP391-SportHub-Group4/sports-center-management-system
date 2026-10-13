"use client";
import { useParams } from "next/navigation";
import { PtPage } from "@/features/pt/ui";
import { CoachStudentProfile } from "@/features/pt/coach-students";

export default function Page() {
  const { memberId } = useParams<{ memberId: string }>();

  return (
    <PtPage title="members">
      <CoachStudentProfile key={memberId} memberId={memberId} />
    </PtPage>
  );
}
