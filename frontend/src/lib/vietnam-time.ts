/** Date-only and datetime-local controls always represent Vietnam wall time, not browser time. */
export function vietnamUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("invalid_local_datetime");
  return new Date(`${value}:00+07:00`).toISOString();
}
export function vietnamLocal(value: string): string {
  return new Date(new Date(value).getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
}
export function dayRange(from: string, to: string) {
  return {
    fromUtc: vietnamUtc(`${from}T00:00`),
    toUtc: new Date(
      new Date(vietnamUtc(`${to}T00:00`)).getTime() + 86400000,
    ).toISOString(),
  };
}
