"use client";
import { useParams } from "next/navigation";
import { StaffPage } from "@/features/coaching/ui";
import { CoachStudentProfile } from "@/features/coaching/coach-students";

export default function Page() {
  const { memberId } = useParams<{ memberId: string }>();

  return (
    <StaffPage title="members">
      <CoachStudentProfile key={memberId} memberId={memberId} />
    </StaffPage>
  );
}
