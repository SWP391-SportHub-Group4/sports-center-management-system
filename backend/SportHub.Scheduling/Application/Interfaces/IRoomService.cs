using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IRoomService
{
    Task<IReadOnlyList<RoomResponse>> GetAllAsync(CancellationToken ct = default);

    Task<RoomResponse> CreateAsync(SaveRoomRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<RoomResponse> UpdateAsync(int roomId, SaveRoomRequest request, Guid actorUserId, CancellationToken ct = default);

    Task DeleteAsync(int roomId, Guid actorUserId, CancellationToken ct = default);
}
