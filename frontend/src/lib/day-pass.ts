/** Mã gói vé Gym 1 ngày (seed cố định, khớp DayPass.PackageId ở backend). */
export const DAY_PASS_PACKAGE_ID = 50000;

/** Giờ đóng cửa và khoảng báo trước, khớp DayPass.ClosesHourLocal và CheckoutService ở backend. */
const GYM_CLOSES_HOUR = 22;
const CLOSING_NOTICE_MINUTES = 60;

/** True trong 60 phút cuối trước giờ đóng cửa (giờ Việt Nam). Chỉ dùng khi chưa có checkout để đọc cờ từ server. */
export function isGymClosingSoon(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const minutesToClose = GYM_CLOSES_HOUR * 60 - (hour * 60 + minute);
  return minutesToClose > 0 && minutesToClose <= CLOSING_NOTICE_MINUTES;
}
