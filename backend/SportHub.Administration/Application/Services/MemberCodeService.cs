using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Application.Services;

/// <summary>A short-lived lookup code. Possession never grants entry, payment or check-in rights.</summary>
public sealed class MemberCodeService(
    ISportHubDbContext db, IDataProtectionProvider protection, IUserAdminService users, IClock clock)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    public async Task<MemberCodeResponse> IssueAsync(Guid memberId, CancellationToken ct)
    {
        var active = await db.Set<UserAccount>().AsNoTracking().AnyAsync(u => u.UserId == memberId
            && u.Status == UserStatus.Active && u.Role != null && u.Role.RoleName == UserRole.Member, ct);
        if (!active) throw new ForbiddenException("member_code_unavailable", "Tài khoản hội viên không hoạt động.");
        var expiresAtUtc = clock.UtcNow.Add(Lifetime);
        var code = Protector().Protect(memberId.ToString("N"), Lifetime);
        return new MemberCodeResponse(code, expiresAtUtc);
    }

    public async Task<UserAdminResponse> LookupAsync(string code, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length > 2048)
            throw new BadRequestException("member_code_invalid", "Mã hội viên không hợp lệ hoặc đã hết hạn.");
        Guid memberId;
        try
        {
            if (!Guid.TryParseExact(Protector().Unprotect(code), "N", out memberId))
                throw new CryptographicException();
        }
        catch (CryptographicException)
        {
            throw new BadRequestException("member_code_invalid", "Mã hội viên không hợp lệ hoặc đã hết hạn.");
        }
        var active = await db.Set<UserAccount>().AsNoTracking().AnyAsync(u => u.UserId == memberId
            && u.Status == UserStatus.Active && u.Role != null && u.Role.RoleName == UserRole.Member, ct);
        if (!active) throw new BadRequestException("member_code_invalid", "Mã hội viên không hợp lệ hoặc đã hết hạn.");
        return await users.GetAsync(memberId, ct);
    }

    private ITimeLimitedDataProtector Protector()
        => protection.CreateProtector("SportHub.MemberLookupCode.v1").ToTimeLimitedDataProtector();
}

public sealed record MemberCodeResponse(string Code, DateTime ExpiresAtUtc);
