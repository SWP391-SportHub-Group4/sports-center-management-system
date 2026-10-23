export interface Period {
  fromDate: string;
  toDate: string;
}
export interface PeriodSelection extends Period {
  compare: "off" | "previous" | "custom";
  compareFrom: string;
  compareTo: string;
}
const dayMs = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function monthPeriod(today: string, offset = 0): Period {
  const date = new Date(`${today}T00:00:00Z`);
  return {
    fromDate: iso(
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)),
    ),
    toDate: iso(
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0),
      ),
    ),
  };
}
export function periodDays(p: Period): number {
  return (
    Math.round((Date.parse(p.toDate) - Date.parse(p.fromDate)) / dayMs) + 1
  );
}
export function validPeriod(p: Period): boolean {
  const days = periodDays(p);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(p.fromDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.toDate) &&
    days > 0 &&
    days <= 366
  );
}
export function reportPeriods(
  selection: PeriodSelection,
  today: string,
  financial: boolean,
) {
  const primary: Period = {
    fromDate: selection.fromDate,
    toDate: selection.toDate,
  };
  let comparison: Period | null =
    selection.compare === "off"
      ? null
      : selection.compare === "custom"
        ? { fromDate: selection.compareFrom, toDate: selection.compareTo }
        : monthPeriod(selection.fromDate, -1);
  if (financial) {
    primary.toDate = primary.toDate < today ? primary.toDate : today;
    // Compare elapsed days when the selected period is the current calendar month.
    const current = monthPeriod(today);
    if (
      comparison &&
      selection.compare === "previous" &&
      selection.fromDate === current.fromDate &&
      selection.toDate === current.toDate
    ) {
      comparison = {
        ...comparison,
        toDate:
          comparison.toDate.slice(0, 8) +
          String(
            Math.min(
              Number(today.slice(8)),
              Number(comparison.toDate.slice(8)),
            ),
          ).padStart(2, "0"),
      };
    }
    if (comparison && comparison.toDate > today) comparison.toDate = today;
  }
  return {
    primary: validPeriod(primary) ? primary : null,
    comparison: comparison && validPeriod(comparison) ? comparison : null,
  };
}
export function changeLabel(
  current: number,
  previous: number,
  equalLength: boolean,
  format: (n: number) => string,
) {
  const delta = current - previous;
  const absolute = `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${format(Math.abs(delta))}`;
  return equalLength && previous > 0
    ? `${absolute} (${delta > 0 ? "+" : ""}${((delta / previous) * 100).toFixed(1)}%)`
    : absolute;
}
