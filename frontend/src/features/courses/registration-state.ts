import type { CourseDto } from "@/lib/types";

export function courseRegistrationState(
  course: CourseDto,
  enrolled: boolean,
  now: number,
) {
  if (enrolled) return "registered";
  if (course.status !== "PUBLISHED") return "closed";
  if (!course.firstSessionStartUtc) return "unscheduled";
  if (!Number.isFinite(Date.parse(course.firstSessionStartUtc)))
    return "unscheduled";
  if (Date.parse(course.firstSessionStartUtc) <= now) return "started";
  if (course.availableSeats <= 0) return "full";
  return "open";
}

export function registrationReason(
  state: ReturnType<typeof courseRegistrationState>,
  vi: boolean,
) {
  switch (state) {
    case "registered":
      return vi ? "Bạn đã đăng ký lớp này." : "You are already registered.";
    case "started":
      return vi
        ? "Lớp đã bắt đầu, không nhận đăng ký mới."
        : "This class has started and no longer accepts registrations.";
    case "full":
      return vi
        ? "Lớp đã đủ người, không còn chỗ đăng ký."
        : "This class is full. No places are available.";
    case "unscheduled":
      return vi
        ? "Lớp chưa có lịch học để đăng ký."
        : "Registration is unavailable until sessions are published.";
    default:
      return vi
        ? "Lớp không còn nhận đăng ký."
        : "This class no longer accepts registrations.";
  }
}
