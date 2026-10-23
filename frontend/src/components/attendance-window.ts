/** Attendance opens 5 minutes before a session and stays correctable for 24 hours after it ends. */
export const EARLY_MINUTES = 5;
export const CORRECTION_HOURS = 24;

export type SessionPhase = "upcoming" | "live" | "editable" | "locked";

export function sessionPhase(
  startAtUtc: string,
  endAtUtc: string,
  now: number,
): SessionPhase {
  const start = new Date(startAtUtc).getTime();
  const end = new Date(endAtUtc).getTime();
  if (now < start - EARLY_MINUTES * 60_000) return "upcoming";
  if (now <= end) return "live";
  if (now <= end + CORRECTION_HOURS * 3_600_000) return "editable";
  return "locked";
}

/** Time left to correct a finished session, e.g. "14h 30m". */
export function correctionRemaining(endAtUtc: string, now: number): string {
  const left = Math.max(
    0,
    new Date(endAtUtc).getTime() + CORRECTION_HOURS * 3_600_000 - now,
  );
  const minutes = Math.floor(left / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function phaseLabel(
  phase: SessionPhase,
  endAtUtc: string,
  now: number,
): string {
  switch (phase) {
    case "upcoming":
      return "Chưa mở điểm danh";
    case "live":
      return "Đang điểm danh";
    case "editable":
      return `Còn hạn sửa: ${correctionRemaining(endAtUtc, now)}`;
    default:
      return "Đã khóa";
  }
}
