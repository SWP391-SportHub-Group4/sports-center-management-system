namespace SportHub.BuildingBlocks.SharedKernel.Errors;

/// <summary>Stable API error codes for the payment and support workflow.</summary>
public static class PaymentSupportErrorCodes
{
    public const string DayPassOutsideHours = "day_pass_outside_hours";
    public const string SupportRemindTooEarly = "support_remind_too_early";
    public const string PayoutProofRequired = "payout_proof_required";
    public const string PayoutAmountExceedsPaid = "payout_amount_exceeds_paid";
    public const string PayoutAlreadyRecorded = "payout_already_recorded";
    public const string PayoutNotFound = "payout_not_found";
    public const string ReconciliationAlreadyResolved = "reconciliation_already_resolved";
    public const string PaymentRequestAlreadyOpen = "payment_request_already_open";
}
