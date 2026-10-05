export type CalendarView = "day" | "week" | "list";

export interface CalendarEvent {
  id: string;
  title: string;
  type: string;
  startAtUtc: string;
  endAtUtc: string;
  roomName?: string | null;
  coachName?: string | null;
  status?: string | null;
  description?: string | null;
}

export interface CalendarLabels {
  day: string;
  week: string;
  list: string;
  previous: string;
  today: string;
  next: string;
  empty: string;
  eventDetails: string;
}