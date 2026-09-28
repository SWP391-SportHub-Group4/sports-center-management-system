"use client";

import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";

/**
 * BR-98, mới 28/09/2026 — điểm danh Yoga/Group X chuyển hẳn cho Receptionist; Coach (kể cả
 * PersonalTrainer) không còn điểm danh được qua API, nên bảng điểm danh theo buổi cũ đã bỏ khỏi
 * trang này (gọi /api/attendance hoặc /api/class-sessions/{id}/roster giờ trả 403 cho Coach).
 *
 * Ghi kết quả buổi PT (WorkoutResult) vẫn CHƯA có UI ở đây: entity đại diện 1 PT session chưa
 * được chốt (SSOT §7, plan §4.1) — WorkoutResult hiện tại gắn với Enrollment của lớp Yoga/Group X
 * mà PersonalTrainer không dạy, nên không có luồng chọn buổi PT nào để tái sử dụng ở đây. Không
 * dựng luồng giả — chỉ hiện thông báo chờ quyết định, tránh tuyên bố tính năng đã hoàn chỉnh.
 */
export default function CoachAttendancePage() {
  return (
    <AppShell
      title="Training results"
      description="Recording PT session results — pending PT session model"
      allow={["Coach"]}
      requireCoachCategory="PersonalTrainer"
    >
      <Card title="Not available yet">
        <p className="muted">
          Điểm danh Yoga/Group X đã chuyển cho Lễ tân (BR-98). Ghi kết quả buổi
          PT (progress note, nhận xét) đang chờ chốt mô hình buổi PT (SSOT §7)
          — chưa có màn hình chọn buổi PT để ghi kết quả ở đây, tránh dựng một
          luồng giả trong khi entity đại diện buổi PT chưa được quyết định.
        </p>
      </Card>
    </AppShell>
  );
}
