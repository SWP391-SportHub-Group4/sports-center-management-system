const DAY_MS = 86400000;

/** ISO weeks start on Monday; the week-year is the year containing Thursday. */
export function dateToIsoWeek(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const year = date.getUTCFullYear();
  const week = Math.ceil(
    ((date.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function isoWeekToDate(value: string): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (year < 1000 || week < 1 || week > 53) return null;
  const january4 = new Date(Date.UTC(year, 0, 4));
  january4.setUTCDate(4 - ((january4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  const date = january4.toISOString().slice(0, 10);
  return dateToIsoWeek(date) === value ? date : null;
}
