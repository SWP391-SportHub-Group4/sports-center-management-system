namespace SportHub.Training.Domain.Enums;

/// <summary>Mới 29/09/2026 (BE-4). Mỗi session tối đa 1 request Pending.</summary>
public enum PtSessionChangeRequestStatus
{
    Pending,
    Approved,
    Rejected,
    Withdrawn
}
