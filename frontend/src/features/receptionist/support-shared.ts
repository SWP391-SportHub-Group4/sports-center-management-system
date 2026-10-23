export type SupportAssignee = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  APPROVED_AWAITING_PAYOUT: "Approved · awaiting transfer",
  DONE: "Done",
  REJECTED: "Rejected",
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
    | "REFUND_APPROVED"
    | "PAYOUT_FLAGGED"
    | "DONE"
    | "REJECTED";
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
    case "REFUND_APPROVED":
      return `${event.actorName} approved the refund`;
    case "PAYOUT_FLAGGED":
      return `${event.actorName} flagged the transfer for reconciliation`;
    case "DONE":
      return `${event.actorName} marked it as done`;
    case "REJECTED":
      return `${event.actorName} rejected the request`;
    default:
      return event.actorName;
  }
}
