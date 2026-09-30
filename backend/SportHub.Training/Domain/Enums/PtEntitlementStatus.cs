namespace SportHub.Training.Domain.Enums;

/// <summary>Mới 29/09/2026 (BE-4). Xem docs/backend-be4-pt-training-implementation-plan.md §6.5.</summary>
public enum PtEntitlementStatus
{
    PendingPayment,
    Active,
    AwaitingCarryOver,
    Exhausted,
    Expired,
    Cancelled
}
