"use client";
import { OperationsPage } from "@/features/operations/ui";
import { CourtCalendar } from "@/features/court-schedule/court-calendar";
import { MemberPicker } from "@/components/MemberPicker";
import { useDeskMember } from "@/features/receptionist/desk-context";
export default function Page() {
  const { member, setMember } = useDeskMember();
  return (
    <OperationsPage title="courtSchedule" roles={["Receptionist"]}>
      <MemberPicker value={member} onChange={setMember} />
      {member && <CourtCalendar key={member.userId} memberId={member.userId} />}
    </OperationsPage>
  );
}
