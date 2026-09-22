using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Interfaces;

public interface ISystemSettingService
{
    Task<IReadOnlyList<SystemSettingResponse>> GetAllAsync(CancellationToken ct = default);

    Task<SystemSettingResponse> UpdateAsync(string key, string value, Guid actorUserId, CancellationToken ct = default);
}
