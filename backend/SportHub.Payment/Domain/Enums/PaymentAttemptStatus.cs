namespace SportHub.Payment.Domain.Enums;

public enum PaymentAttemptStatus
{
    Pending = 0,
    Expired = 1,
    Succeeded = 2,
    Failed = 3,
    ReconciliationRequired = 4
}
