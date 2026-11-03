import type { CourseDto } from "@/lib/types";

export function courseRegistrationState(
  course: CourseDto,
  enrolled: boolean,
  now: number,
) {
  if (enrolled) return "registered";
  if (course.status !== "PUBLISHED" && course.status !== "IN_PROGRESS")
    return "closed";
  if (!course.firstSessionStartUtc) return "unscheduled";
  if (!Number.isFinite(Date.parse(course.firstSessionStartUtc)))
    return "unscheduled";
  // Khóa đang học vẫn nhận ghi danh giữa chừng; chỉ đóng khi không còn buổi sắp tới.
  if (course.status === "IN_PROGRESS") {
    if ((course.sessionsRemaining ?? 0) <= 0) return "started";
  } else if (Date.parse(course.firstSessionStartUtc) <= now) return "started";
  if (course.thresholdResponseClosed) return "thresholdClosed";
  // Closed by the manager (e.g. an incident). Checkouts that already hold a seat can still finish,
  // but nobody new can start one, so this is not the same as "full".
  if (!course.enrollmentOpen) return "paused";
  if (course.availableSeats <= 0) return "full";
  return "open";
}

/** Một định nghĩa duy nhất "khóa đang nhận đăng ký mới" cho Member (Explore) và Lễ tân (bán khóa thay Member). */
export function isCourseOpenForRegistration(course: CourseDto, now: number) {
  return courseRegistrationState(course, false, now) === "open";
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
        ? "Lớp đã học hết các buổi, không nhận đăng ký mới."
        : "This class has no upcoming sessions and no longer accepts registrations.";
    case "paused":
      return vi
        ? "Trung tâm đang tạm dừng nhận đăng ký lớp này. Hãy quay lại sau hoặc chọn lớp khác."
        : "The center has temporarily paused registration for this class. Check back later or choose another class.";
    case "thresholdClosed":
      return vi
        ? "Lớp đang chờ quyết định mở lớp. Hiện không nhận đăng ký mới."
        : "This class is awaiting a decision to run and is not accepting new registrations.";
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
