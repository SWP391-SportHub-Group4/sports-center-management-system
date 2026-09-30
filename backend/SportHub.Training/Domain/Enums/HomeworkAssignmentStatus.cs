namespace SportHub.Training.Domain.Enums;

/// <summary>Mới 29/09/2026 (BE-4). Member chỉ chuyển InProgress/Completed + feedback; PT mới Reviewed/Cancelled.</summary>
public enum HomeworkAssignmentStatus
{
    Assigned,
    InProgress,
    Completed,
    Reviewed,
    Cancelled
}
