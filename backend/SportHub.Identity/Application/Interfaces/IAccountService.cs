using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Application.Services;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Interfaces;

public interface IAccountService
{
    Task<MyAccountResponse> GetMeAsync(Guid userId, CancellationToken ct = default);

    Task<MyAccountResponse> UpdateProfileAsync(Guid userId, UpdateMyProfileRequest request, CancellationToken ct = default);

    Task SetPasswordAsync(Guid userId, SetPasswordRequest request, CancellationToken ct = default);
}
