using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Identity.Application.Interfaces;

public interface IGoogleAuthService
{
    Task<AuthResponse> LoginAsync(string idToken, CancellationToken ct = default);

    Task LinkAsync(Guid userId, string idToken, CancellationToken ct = default);

    Task UnlinkAsync(Guid userId, CancellationToken ct = default);
}
