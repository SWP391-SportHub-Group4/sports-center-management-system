"use client";

import { AppShell } from "@/components/AppShell";
import { AttendanceBoard } from "@/components/AttendanceBoard";

export default function ReceptionAttendancePage() {
  return (
    <AppShell
      title="Counting at the counter"
      description="Noted membership is present or absent for the day's study (BR-22)"
      allow={["Receptionist"]}
    >
      {/* Lễ tân điểm danh cho MỌI buổi, khác với HLV chỉ điểm danh buổi mình dạy. */}
      <AttendanceBoard coachOnly={false} />
    </AppShell>
  );
}
