/** DTOs of the bank-refund (Support Request PAYMENT) workflow. Every figure is computed by the server. */

export type BankRefundStatus =
  "PENDING" | "APPROVED_AWAITING_PAYOUT" | "PAID" | "REJECTED";

export interface BankRefundItemRow {
  invoiceItemId: string;
  itemType: string;
  description: string;
  invoiceNumber: string;
  paidAt: string | null;
  lineAmount: number;
  remainingRefundableVnd: number;
  eligible: boolean;
  ineligibleReason: string | null;
}

export interface PriorRefundRow {
  kind: string;
  status: string;
  amountVnd: number;
  points: number | null;
  at: string;
}

export interface RefundServiceSnapshot {
  invoiceItemId: string;
  itemType: string;
  description: string;
  invoiceId: string;
  invoiceNumber: string;
  invoicePaidAt: string | null;
  lineAmount: number;
  paidCashVnd: number;
  paidPointsVnd: number;
  paidTotalVnd: number;
  priorPointRefundVnd: number;
  priorBankRefundVnd: number;
  remainingRefundableVnd: number;
  entitlementStatus: string;
  startDate: string | null;
  endDate: string | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  unitLabel: string | null;
  totalUnits: number | null;
  usedUnits: number | null;
  unusedUnits: number | null;
  notes: string[];
  priorRefunds: PriorRefundRow[];
}

export interface RefundPolicySnapshot {
  percent: number;
  suggestedVnd: number;
  basis: string;
  centerFaultPercent: number;
  centerFaultSuggestedVnd: number;
  centerFaultBasis: string;
  evaluatedAtUtc: string;
  disclaimer: string;
}

export interface BankRefundView {
  bankRefundId: string;
  supportRequestId: string;
  status: BankRefundStatus;
  ticketStatus: string;
  memberId: string;
  memberName: string | null;
  account: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    masked: boolean;
  };
  service: RefundServiceSnapshot;
  policy: RefundPolicySnapshot;
  approvedAmount: number | null;
  centerFault: boolean;
  approvalReason: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  payout: {
    amount: number;
    transferredAt: string;
    reference: string | null;
    note: string;
    paidByName: string | null;
    recordedAtUtc: string;
  } | null;
  needsReconciliation: boolean;
  reconciliationNote: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  createdAt: string;
  frozen: boolean;
}

export const MAX_SUPPORT_IMAGES = 3;
export const MAX_SUPPORT_IMAGE_BYTES = 5 * 1024 * 1024;
export const SUPPORT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ITEM_TYPE_LABELS: Record<string, string> = {
  Membership: "Gym membership",
  ClassPackage: "Class",
  Rental: "Court rental",
};

export const BANK_REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "Waiting for review",
  APPROVED_AWAITING_PAYOUT: "Approved · awaiting transfer",
  PAID: "Refunded to bank account",
  REJECTED: "Not approved",
};

export function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)} ₫`;
}

/** Path that opens the Member's help form on the bank-refund topic with a transaction preselected. */
export function bankRefundHref(
  invoiceItemId: string | null | undefined,
): string {
  return invoiceItemId
    ? `/member/help?topic=PAYMENT&itemId=${encodeURIComponent(invoiceItemId)}`
    : "/member/help?topic=PAYMENT";
}
