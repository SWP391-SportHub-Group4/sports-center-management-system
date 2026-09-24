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
  if (session.status !== "Scheduled") return "This class has been cancelled.";
  if (Date.parse(session.startAt) <= now)
    return "The training session's started.";
  if (
    enrollments.some(
      (e) => e.sessionId === session.id && e.status === "Confirmed",
    )
  )
    return "You've kept your place in this class.";
  if (session.confirmedCount >= session.capacity) return "Class's full.";
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
    return "The time training session with the schedule you have set.";
  return null;
}
