import type { SupportAssignee } from "./support-request-actions";

/** Matches the reference returned when a member submits a support request. */
export function supportReference(requestId: string): string {
  return requestId.replaceAll("-", "").slice(0, 8).toUpperCase();
}

export type SupportStatus =
  "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "REJECTED";

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CLOSED: "Done",
  REJECTED: "Rejected",
};

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
  type: "CREATED" | "ASSIGNED" | "PROGRESS" | "DONE" | "REJECTED";
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
    default:
      return event.actorName;
  }
}

/** Receiver inbox groups legacy routing states without rewriting request history. */
export function receiverStatus(status: string): string {
  if (["OPEN", "ASSIGNED", "NOT_STARTED"].includes(status)) return "NOT_STARTED";
  if (["DONE", "CLOSED", "REJECTED"].includes(status)) return "DONE";
  return status;
}
export function receiverStatusLabel(status: string): string {
  return receiverStatus(status) === "NOT_STARTED" ? "Not started" : (STATUS_LABELS[receiverStatus(status)] ?? status);
}
