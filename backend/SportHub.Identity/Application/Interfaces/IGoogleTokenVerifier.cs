using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Identity.Application.Interfaces;

/// <summary>
/// Xác minh Google ID token. Tách khỏi service nghiệp vụ để test thay được bằng bản giả —
/// gọi thật ra Google cần mạng và một tài khoản Google hợp lệ.
/// </summary>
public interface IGoogleTokenVerifier
{
    Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct = default);
}
