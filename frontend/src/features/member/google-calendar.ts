type CalendarEvent = {
  title: string;
  startAtUtc: string;
  endAtUtc: string;
  location?: string | null;
  description?: string | null;
};

/** Open Google's event editor; the member chooses their calendar and saves there. */
export function googleCalendarHref(event: CalendarEvent) {
  const stamp = (value: string) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", `SportHub · ${event.title}`);
  url.searchParams.set(
    "dates",
    `${stamp(event.startAtUtc)}/${stamp(event.endAtUtc)}`,
  );
  url.searchParams.set("ctz", "Asia/Ho_Chi_Minh");
  if (event.location) url.searchParams.set("location", event.location);
  if (event.description) url.searchParams.set("details", event.description);
  return url.toString();
}
