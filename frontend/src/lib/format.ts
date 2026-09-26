const TIME_ZONE = "Asia/Ho_Chi_Minh";
const LOCALE = "en-GB";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");

    return `${day}/${month}/${year}`;
  }

  const date = toDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value)} ₫`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat(LOCALE).format(value);
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    new Date(),
  );
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function vietnamLocalToUtcIso(
  dateIso: string,
  timeHhmm: string,
): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = timeHhmm.split(":").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day, hour - 7, minute),
  ).toISOString();
}

export const LABELS: Record<string, string> = {
  PendingPayment: "Waiting for payment",
  Active: "Active",
  Expired: "Expired",
  Cancelled: "Cancelled",

  Issued: "Issued",
  Paid: "Paid",
  Void: "Void",

  Confirmed: "Confirmed",
  CancelledOnTime: "Cancelled on time",
  CancelledLate: "Cancelled late",

  Present: "Present",
  Absent: "Absent",
  NoShow: "No-show",

  Scheduled: "Scheduled",
  Rescheduled: "Rescheduled",
  Completed: "Completed",

  Requested: "Requested",
  Approved: "Approved",
  Rejected: "Rejected",
  Refund: "Refund",
  Correction: "Correction",
  Discount: "Discount",

  Cash: "Cash",
  Card: "Card",
  Transfer: "Bank transfer",
  EWallet: "E-wallet",

  Banned: "Locked",
  Deactivated: "Deactivated",

  Archived: "Archived",

  Beginner: "Beginner",
  Intermediate: "Intermediate",
  Advanced: "Advanced",

  Pending: "Processing",
  Failed: "Failed",

  PersonalTraining: "Personal Training",
  Yoga: "Yoga",
  GroupX: "Group X",
};

export function label(value: string | null | undefined): string {
  if (!value) return "—";

  return LABELS[value] ?? value;
}

export function chipTone(value: string | null | undefined): string {
  switch (value) {
    case "Active":
    case "Paid":
    case "Confirmed":
    case "Present":
    case "Completed":
    case "Approved":
      return "chip--ok";
    case "PendingPayment":
    case "Issued":
    case "Requested":
    case "Scheduled":
    case "Pending":
    case "Rescheduled":
      return "chip--warn";
    case "Expired":
    case "Cancelled":
    case "CancelledLate":
    case "NoShow":
    case "Void":
    case "Rejected":
    case "Banned":
    case "Deactivated":
    case "Failed":
      return "chip--danger";
    default:
      return "chip--info";
  }
}
