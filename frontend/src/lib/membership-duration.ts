export function monthsOf(days: number) {
  // Only the standard monthly products use month labels; never round odd durations.
  return (
    ({ 30: 1, 90: 3, 180: 6, 365: 12 } as Record<number, number>)[days] ?? 0
  );
}

export function membershipDuration(days: number) {
  const months = monthsOf(days);
  const value = months || days;
  return {
    value,
    unit: months
      ? months === 1
        ? "month"
        : "months"
      : days === 1
        ? "day"
        : "days",
  };
}

