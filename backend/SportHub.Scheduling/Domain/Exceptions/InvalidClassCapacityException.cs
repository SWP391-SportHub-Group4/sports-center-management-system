using SportHub.BuildingBlocks.SharedKernel.Exceptions;
using SportHub.Scheduling.Domain.Constants;

namespace SportHub.Scheduling.Domain.Exceptions;

// Personal Training bị đặt Capacity khác 1 — ở Class hoặc override ở ClassSession.
public sealed class InvalidClassCapacityException(string discipline, int capacity)
    : DomainException(
        $"Discipline '{discipline}' requires capacity = {Disciplines.PersonalTrainingCapacity}, but got {capacity}.")
{
    public string Discipline { get; } = discipline;

    public int Capacity { get; } = capacity;
}
