namespace SportHub.Scheduling.Application.DTOs;

public sealed record RoomResponse(int RoomId, string Name, int Capacity, int ActiveClassCount);
