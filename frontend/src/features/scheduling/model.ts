export interface ClassSession {
  id: string;
  name: string;
  discipline: string;
  coachId: string;
  coachName: string;
  room: string;
  startAt: string;
  endAt: string;
  cancellationDeadline: string;
  capacity: number;
  confirmedCount: number;
  status: "Scheduled" | "Cancelled";
}
export interface Enrollment {
  sessionId: string;
  memberPackageId: string;
  status: "Confirmed" | "CancelledOnTime" | "CancelledLate";
}
export type BookingFilter = "all" | "available" | "booked";
export function bookingProblem(
  session: ClassSession,
  sessions: ClassSession[],
  enrollments: Enrollment[],
  now: number,
): string | null {
  if (session.status !== "Scheduled") return "Lớp này đã bị hủy.";
  if (Date.parse(session.startAt) <= now) return "Buổi tập đã bắt đầu.";
  if (
    enrollments.some(
      (e) => e.sessionId === session.id && e.status === "Confirmed",
    )
  )
    return "Bạn đã giữ chỗ trong lớp này.";
  if (session.confirmedCount >= session.capacity) return "Lớp đã hết chỗ.";
  if (
    sessions.some(
      (other) =>
        enrollments.some(
          (e) => e.sessionId === other.id && e.status === "Confirmed",
        ) &&
        Date.parse(other.startAt) < Date.parse(session.endAt) &&
        Date.parse(other.endAt) > Date.parse(session.startAt),
    )
  )
    return "Buổi tập trùng giờ với lịch bạn đã đặt.";
  return null;
}
