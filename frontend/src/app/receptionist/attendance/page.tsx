"use client";
import { OperationsPage } from "@/features/operations/ui";
import { AttendanceBoard } from "@/components/AttendanceBoard";
export default function Page() {
  return (
    <OperationsPage title="attendance" roles={["Receptionist"]}>
      <AttendanceBoard coachOnly={false} />
    </OperationsPage>
  );
}
