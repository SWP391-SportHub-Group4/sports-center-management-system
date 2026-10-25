import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";

export interface SupportPayoutView {
  amount: number;
  recordedAtUtc: string;
  memberConfirmedAtUtc: string | null;
  memberConfirmedBy: string | null;
  proofAttachmentIds: string[];
}

/** One row of `GET /api/support/requests/mine`. */
export interface SupportRequestDto {
  requestId: string;
  category: string;
  description: string;
  status: string;
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string | null;
  response: string | null;
  slaDueAtUtc: string;
  remindCount: number;
  payout: SupportPayoutView | null;
  isOverdue: boolean;
  canRemindAtUtc: string | null;
}

export type RequestStageKey =
  | "received"
  | "assigned"
  | "inProgress"
  | "confirmReceipt"
  | "paidOut"
  | "notReceived"
  | "resolved"
  | "closed"
  | "rejected";

export interface RequestStage {
  key: RequestStageKey;
  label: string;
  /** Short sentence telling the member what happens next. */
  hint: string;
}

const isFinal = (status: string) =>
  status === "DONE" || status === "REJECTED" || status === "CLOSED";

/** The member must press "I received it" / "Not received" for this request. */
export function needsMemberConfirmation(row: SupportRequestDto): boolean {
  return (
    row.payout !== null &&
    row.payout.memberConfirmedAtUtc === null &&
    row.status === "CLOSED"
  );
}

/** Maps the API status and payout to the stage shown to the member. */
export function requestStage(row: SupportRequestDto): RequestStage {
  if (row.payout) {
    if (row.payout.memberConfirmedAtUtc)
      return {
        key: "paidOut",
        label: "Paid out",
        hint:
          row.payout.memberConfirmedBy === "SYSTEM"
            ? "The transfer receipt was confirmed automatically."
            : "The transfer was recorded and you confirmed receipt.",
      };
    if (row.status === "DONE")
      return {
        key: "resolved",
        label: "Review completed",
        hint: "The manager completed your payout review. Read the reply below. This does not confirm that you received the transfer.",
      };
    if (row.status === "REJECTED")
      return {
        key: "rejected",
        label: "Review declined",
        hint: "The manager declined your payout claim. Read the reason below. This does not confirm that you received the transfer.",
      };
    if (row.status === "CLOSED")
      return {
        key: "confirmReceipt",
        label: "Confirm receipt",
        hint: "We sent the money. Check the proof and tell us whether you received it.",
      };
    return {
      key: "notReceived",
      label: "Reported not received",
      hint: "You told us the transfer did not arrive. Our manager is checking it.",
    };
  }
  switch (row.status) {
    case "ASSIGNED":
      return {
        key: "assigned",
        label: "Assigned",
        hint: "A staff member is looking at your request.",
      };
    case "IN_PROGRESS":
      return {
        key: "inProgress",
        label: "In progress",
        hint: "Our team is working on it.",
      };
    case "DONE":
      return {
        key: "resolved",
        label: "Resolved",
        hint: "Your request has been handled.",
      };
    case "CLOSED":
      return {
        key: "closed",
        label: "Closed",
        hint: "This request is closed.",
      };
    case "REJECTED":
      return {
        key: "rejected",
        label: "Declined",
        hint: "We could not approve this request. See the reply below.",
      };
    default:
      return {
        key: "received",
        label: "Received",
        hint: "We received your request and will reply soon.",
      };
  }
}

export function isRequestOpen(row: SupportRequestDto) {
  return !isFinal(row.status);
}

/** The API omits null fields, so fill them in once here instead of guarding every use. */
function normalize(row: Partial<SupportRequestDto>): SupportRequestDto {
  return {
    ...(row as SupportRequestDto),
    invoiceId: row.invoiceId ?? null,
    updatedAt: row.updatedAt ?? null,
    response: row.response ?? null,
    canRemindAtUtc: row.canRemindAtUtc ?? null,
    isOverdue: row.isOverdue ?? false,
    remindCount: row.remindCount ?? 0,
    payout: row.payout
      ? {
          ...row.payout,
          memberConfirmedAtUtc: row.payout.memberConfirmedAtUtc ?? null,
          memberConfirmedBy: row.payout.memberConfirmedBy ?? null,
          proofAttachmentIds: row.payout.proofAttachmentIds ?? [],
        }
      : null,
  };
}

export function useMySupportRequests() {
  return useApi(
    async (signal) =>
      (
        await api.get<Partial<SupportRequestDto>[]>(
          "/api/support/requests/mine",
          {
            signal,
          },
        )
      ).map(normalize),
    [],
  );
}
