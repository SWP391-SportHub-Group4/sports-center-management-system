namespace SportHub.Training.Domain.Enums;

/// <summary>Mới 29/09/2026 (BE-4). Chỉ Scheduled chặn slot thời gian.</summary>
public enum PtSessionStatus
{
    Scheduled,
    Completed,
    CancelledOnTime,
    CancelledLate,
    NoShow,
    RescheduledOnTime,
    RescheduledLate,
    PendingPayment
}
