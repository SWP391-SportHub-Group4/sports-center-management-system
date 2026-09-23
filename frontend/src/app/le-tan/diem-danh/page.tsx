"use client";

import { AppShell } from "@/components/AppShell";
import { AttendanceBoard } from "@/components/AttendanceBoard";

export default function ReceptionAttendancePage() {
  return (
    <AppShell
      title="Điểm danh tại quầy"
      description="Ghi nhận hội viên có mặt hoặc vắng cho các buổi học trong ngày (BR-22)"
      allow={["Receptionist"]}
    >
      {/* Lễ tân điểm danh cho MỌI buổi, khác với HLV chỉ điểm danh buổi mình dạy. */}
      <AttendanceBoard coachOnly={false} />
    </AppShell>
  );
}
