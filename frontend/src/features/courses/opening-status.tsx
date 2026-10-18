"use client";
import { StatusChip } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { CourseDto } from "@/lib/types";

export function CourseOpeningStatus({
  course,
  compact = false,
}: {
  course: CourseDto;
  compact?: boolean;
}) {
  const { language } = useLanguage();
  if (course.status !== "PUBLISHED") return null;
  const vi = language === "vi";
  return (
    <>
      <StatusChip
        value={course.openingConfirmed ? "CONFIRMED" : "PENDING"}
        tone={course.openingConfirmed ? "success" : "warning"}
        label={
          course.openingConfirmed
            ? vi
              ? "Đã xác nhận mở lớp"
              : "Confirmed to run"
            : vi
              ? "Chưa xác nhận mở lớp"
              : "Opening not confirmed"
        }
      />
      {!compact && !course.openingConfirmed && (
        <p className="small muted">
          {vi
            ? "Trung tâm đang chốt số học viên. Bạn sẽ được thông báo khi lớp được xác nhận mở hoặc cần chọn chuyển lớp / hoàn điểm."
            : "The center is reviewing enrollment. You will be notified when the class is confirmed or when transfer / points refund choices are available."}
        </p>
      )}
    </>
  );
}
