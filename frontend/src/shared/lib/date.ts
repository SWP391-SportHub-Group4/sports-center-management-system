export const TIME_ZONE = "Asia/Ho_Chi_Minh";
export function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00+07:00`);
  date.setDate(date.getDate() + amount);
  return dayKey(date);
}
export function monday(day: string): string {
  const weekday = new Date(`${day}T12:00:00+07:00`).getUTCDay();
  return addDays(day, -(weekday + 6) % 7);
}
export const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value));
export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    value,
  );
