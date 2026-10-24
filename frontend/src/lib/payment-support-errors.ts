/** Stable error codes returned by the payment and support APIs. */
export const paymentSupportErrorCodes = {
  dayPassOutsideHours: "day_pass_outside_hours",
  supportRemindTooEarly: "support_remind_too_early",
  payoutProofRequired: "payout_proof_required",
  payoutAmountExceedsPaid: "payout_amount_exceeds_paid",
  payoutAlreadyRecorded: "payout_already_recorded",
  payoutNotFound: "payout_not_found",
  reconciliationAlreadyResolved: "reconciliation_already_resolved",
  paymentRequestAlreadyOpen: "payment_request_already_open",
} as const;
