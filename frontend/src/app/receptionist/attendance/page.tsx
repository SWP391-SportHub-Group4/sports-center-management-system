"use client";

import { AppShell } from "@/components/AppShell";
import { AttendanceBoard } from "@/components/AttendanceBoard";
import { useLanguage } from "@/lib/language";

export default function ReceptionAttendancePage() {
  const { language } = useLanguage();

  return (
    <AppShell
      title={language === "en" ? "Front Desk Attendance" : "Điểm danh tại quầy"}
      description={
        language === "en"
          ? "Mark member attendance (Present or Absent) for scheduled class sessions (BR-22)"
          : "Ghi nhận hội viên có mặt hoặc vắng mặt cho các ca học trong ngày (BR-22)"
      }
      allow={["Receptionist"]}
    >
      {/* Lễ tân điểm danh cho MỌI buổi, khác với HLV chỉ điểm danh buổi mình dạy. */}
      <AttendanceBoard coachOnly={false} />
    </AppShell>
  );
}
