import type { SupportAssignee } from "./support-request-actions";

/** Matches the reference returned when a member submits a support request. */
export function supportReference(requestId: string): string {
  return requestId.replaceAll("-", "").slice(0, 8).toUpperCase();
}

export type SupportStatus =
  "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "REJECTED" | "CLOSED";

export const CHANNEL_LABELS: Record<string, string> = {
  COUNTER: "At the counter",
  PHONE: "By phone",
  FANPAGE: "Fanpage / Zalo",
  ONLINE: "Member (online)",
};

export type RoleKey = "receptionist" | "manager" | "admin" | "coach";

export const ROLE_RANK: Record<RoleKey, number> = {
  receptionist: 0,
  coach: 0,
  manager: 1,
  admin: 2,
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  receptionist: "Receptionist",
  coach: "Coach",
  manager: "Manager",
  admin: "Administrator",
};

/** Normalizes any wire spelling of a role ("CenterManager", "CENTER_MANAGER") to a department key. */
export function roleKey(role: string | null | undefined): RoleKey {
  const value = (role ?? "").toUpperCase();
  if (value.includes("ADMIN")) return "admin";
  if (value.includes("MANAGER")) return "manager";
  if (value.includes("COACH")) return "coach";
  return "receptionist";
}

export function assigneesByRole(
  assignees: SupportAssignee[],
  role: RoleKey,
): SupportAssignee[] {
  return assignees.filter((x) => roleKey(x.role) === role);
}

export interface SupportEventDto {
  eventId: string;
  type:
    | "CREATED"
    | "ASSIGNED"
    | "PROGRESS"
    | "DONE"
    | "REJECTED"
    | "REMINDED_BY_MEMBER"
    | "SLA_REMINDER_SENT"
    | "PAYOUT_RECORDED"
    | "MEMBER_CONFIRMED_RECEIVED"
    | "MEMBER_REPORTED_NOT_RECEIVED";
  note: string | null;
  createdAt: string;
  actorName: string;
  actorRole: string | null;
  targetName: string | null;
}

export function eventText(event: SupportEventDto): string {
  switch (event.type) {
    case "CREATED":
      return `${event.actorName} created the request`;
    case "ASSIGNED":
      return `${event.actorName} assigned it to ${event.targetName ?? "a staff member"}`;
    case "PROGRESS":
      return `${event.actorName} added a progress note`;
    case "DONE":
      return `${event.actorName} marked it as done`;
    case "REJECTED":
      return `${event.actorName} rejected the request`;
    case "REMINDED_BY_MEMBER":
      return `${event.actorName} reminded the support team`;
    case "SLA_REMINDER_SENT":
      return "The response deadline reminder was sent";
    case "PAYOUT_RECORDED":
      return `${event.actorName} recorded a bank payout`;
    case "MEMBER_CONFIRMED_RECEIVED":
      return event.actorName === "System"
        ? "Payout receipt was confirmed automatically"
        : "Member confirmed receiving the payout";
    case "MEMBER_REPORTED_NOT_RECEIVED":
      return "Member reported that the payout was not received";
    default:
      return event.actorName;
  }
}
