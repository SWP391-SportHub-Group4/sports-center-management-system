/**
 * Định dạng hiển thị.
 *
 * Backend lưu và trả mốc thời gian dạng UTC ISO-8601 (SSOT §5.3); toàn bộ việc quy đổi sang
 * Asia/Ho_Chi_Minh nằm ở đây, không rải rác trong từng màn hình.
 *
 * Cố định timeZone "Asia/Ho_Chi_Minh" thay vì dùng múi giờ của máy: trung tâm chỉ có một
 * địa điểm, nên giờ hiển thị phải là giờ trung tâm kể cả khi người xem ở nơi khác.
 */

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const LOCALE = "en-GB";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | Date | null | undefined): string {
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
    // DateOnly của backend ("2026-09-21") là NGÀY, không có giờ. Cắt chuỗi thay vì dựng Date:
    // new Date("2026-09-21") được hiểu là 00:00 UTC và sẽ lùi một ngày khi đổi sang UTC+7.
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

/** VND là số nguyên (SSOT §5.2) — không hiển thị phần thập phân. */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value)} ₫`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat(LOCALE).format(value);
}

/** Ngày hôm nay theo giờ VN, dạng yyyy-MM-dd để đưa thẳng vào <input type="date">. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/**
 * Ghép ngày (yyyy-MM-dd) và giờ (HH:mm) NGƯỜI DÙNG NHẬP THEO GIỜ VN thành mốc UTC ISO để gửi
 * lên API. Trừ thẳng 7 giờ thay vì để trình duyệt tự suy: máy người dùng có thể đang ở múi
 * giờ khác, và khi đó new Date("...") sẽ hiểu chuỗi theo múi giờ máy.
 */
export function vietnamLocalToUtcIso(dateIso: string, timeHhmm: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = timeHhmm.split(":").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute)).toISOString();
}

/** Nhãn tiếng Việt cho các giá trị enum trả về từ API (PascalCase). */
export const LABELS: Record<string, string> = {
  // MemberPackageStatus
  PendingPayment: "Waiting for payment",
  Active: "Active",
  Expired: "Expired",
  Cancelled: "Cancelled",

  // InvoiceStatus
  Issued: "Issued",
  PartiallyPaid: "Partially paid",
  Paid: "Paid",
  Void: "Void",

  // EnrollmentStatus
  Confirmed: "Confirmed",
  CancelledOnTime: "Cancelled on time",
  CancelledLate: "Cancelled late",

  // AttendanceStatus
  Present: "Present",
  Absent: "Absent",
  NoShow: "No-show",

  // ClassSessionStatus
  Scheduled: "Scheduled",
  Rescheduled: "Rescheduled",
  Completed: "Completed",

  // PaymentAdjustmentStatus / Type
  Requested: "Requested",
  Approved: "Approved",
  Rejected: "Rejected",
  Refund: "Refund",
  Correction: "Correction",
  Discount: "Discount",

  // PaymentMethod
  Cash: "Cash",
  Card: "Card",
  Transfer: "Bank transfer",
  EWallet: "E-wallet",

  // UserStatus
  Banned: "Locked",
  Deactivated: "Deactivated",

  // ClassStatus
  Archived: "Archived",

  // ExperienceLevel
  Beginner: "Beginner",
  Intermediate: "Intermediate",
  Advanced: "Advanced",

  // ReportExportStatus
  Pending: "Processing",
  Failed: "Failed",

  // Discipline
  PersonalTraining: "Personal Training",
  Yoga: "Yoga",
  GroupX: "Group X",
};

export function label(value: string | null | undefined): string {
  if (!value) return "—";

  return LABELS[value] ?? value;
}

/** Màu chip theo ngữ nghĩa trạng thái — dùng chung để cùng một trạng thái luôn cùng màu. */
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
    case "PartiallyPaid":
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
