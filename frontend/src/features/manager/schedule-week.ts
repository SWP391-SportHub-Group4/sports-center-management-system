import { addDaysIso } from "@/lib/format";
export function mondayOf(date: string) {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return addDaysIso(date, -(day + 6) % 7);
}
export function isoWeek(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return year + "-W" + String(week).padStart(2, "0");
}
export function weekMonday(week: string) {
  const [year, num] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4)).toISOString().slice(0, 10);
  return addDaysIso(mondayOf(jan4), (num - 1) * 7);
}
