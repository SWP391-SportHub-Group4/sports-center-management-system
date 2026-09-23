using SportHub.BuildingBlocks.SharedKernel.Exceptions;
using SportHub.Scheduling.Domain.Constants;

namespace SportHub.Scheduling.Domain.Exceptions;

// Class.Discipline ngoài ba giá trị đã chốt (SSOT §1.1) — bao gồm cả "Gym" và "Boxing",
// hai giá trị từng xuất hiện trong comment/doc cũ trước khi chốt scope đa bộ môn.
public sealed class InvalidDisciplineException(string? discipline)
    : DomainException(
        $"Discipline '{discipline}' is not supported. Allowed values: {string.Join(", ", Disciplines.All)}.")
{
    public string? Discipline { get; } = discipline;
}
