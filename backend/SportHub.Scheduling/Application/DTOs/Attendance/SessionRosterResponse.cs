namespace SportHub.Scheduling.Application.DTOs;

public sealed record SessionRosterResponse(
    ClassSessionResponse Session,
    IReadOnlyList<RosterEntryResponse> Entries);
