using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Administration.Application.Services;

/// <summary>
/// Receptionist (và Manager qua FrontDesk) đăng ký Member mới tại quầy. Tài khoản chưa có mật khẩu: Member tự đặt qua link kích hoạt gửi
/// tới email, nên link chứng minh email thuộc đúng người. Trong lúc chờ kích hoạt tài khoản vẫn Active để quầy ghi nhận thanh toán và
/// đăng ký dịch vụ, nhưng Member chưa đăng nhập được bằng mật khẩu. Chỉ tạo role Member; không bao giờ tạo staff.
/// </summary>
public sealed class FrontDeskMemberService(
    ISportHubDbContext db,
    ActivationLinkService activationLinks,
    EmailOtpFlow otpFlow,
    IUserAdminService users,
    IAuditWriter audit,
    IClock clock)
{
    public async Task<UserAdminResponse> CreateAsync(CreateFrontDeskMemberRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var email = request.Email.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        var lowered = email.ToLowerInvariant();
        if (await db.Set<UserAccount>().AnyAsync(u => u.Email.ToLower() == lowered, ct))
            throw new ConflictException("email_already_exists", "Email already exists.");
        if (phone is not null && await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
            throw new ConflictException("phone_already_exists", "Phone already exists.");

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == UserRole.Member, ct);
        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow,
            Credential = new UserCredential { PasswordHash = null },
            Profile = new UserProfile { FullName = request.FullName.Trim(), Phone = phone }
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Set<UserAccount>().Add(user);

        // BR-134: Member có đúng một ví điểm; tạo ví 0 điểm ngay (ví tạo lười ở lần dùng đầu vẫn an toàn vì khóa theo owner).
        db.Set<PointWallet>().Add(new PointWallet { WalletId = Guid.NewGuid(), OwnerUserId = user.UserId, CreatedAtUtc = clock.UtcNow });

        audit.Write(new AuditEntry(actorUserId, AccountAuditActions.FrontDeskCreateMember, nameof(UserAccount), user.UserId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { email, role = nameof(UserRole.Member) })));

        if (!await activationLinks.IssueAsync(email, request.FullName.Trim(), member: true, ct))
            throw new InvalidOperationException("Could not issue a member activation link.");

        await tx.CommitAsync(ct);
        return await users.GetAsync(user.UserId, ct);
    }

    public async Task<UserAdminResponse> ResendActivationAsync(Guid userId, Guid actorUserId, CancellationToken ct = default)
    {
        var user = await LoadPendingMemberAsync(userId, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        audit.Write(new AuditEntry(actorUserId, AccountAuditActions.ResendMemberActivation, nameof(UserAccount), userId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { email = user.Email })));

        if (!await activationLinks.IssueAsync(user.Email, user.Profile?.FullName ?? string.Empty, member: true, ct))
            throw TooSoon();

        await tx.CommitAsync(ct);
        return await users.GetAsync(userId, ct);
    }

    /// <summary>
    /// Sửa email gõ sai khi Member chưa kích hoạt: link cũ bị vô hiệu ngay, link mới gửi tới email mới. Thời hạn chờ kích hoạt (7 ngày
    /// kể từ lúc đăng ký) không được kéo dài bằng cách sửa email — hết hạn thì tài khoản trống bị gỡ khỏi hệ thống.
    /// </summary>
    public async Task<UserAdminResponse> ChangePendingEmailAsync(
        Guid userId, ChangePendingMemberEmailRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var newEmail = request.Email.Trim();
        var user = await LoadPendingMemberAsync(userId, ct);
        var oldEmail = user.Email;
        if (string.Equals(oldEmail, newEmail, StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("email_unchanged", "The new email is the same as the current email.");

        var lowered = newEmail.ToLowerInvariant();
        if (await db.Set<UserAccount>().AnyAsync(u => u.UserId != userId && u.Email.ToLower() == lowered, ct))
            throw new ConflictException("email_already_exists", "Email already exists.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Link đã gửi tới email cũ không được dùng nữa, kể cả khi người nhận nhầm đang giữ nó.
        await otpFlow.DiscardAsync(oldEmail, EmailOtpPurpose.ResetPassword);
        user.Email = newEmail;
        audit.Write(new AuditEntry(actorUserId, AccountAuditActions.ChangePendingMemberEmail, nameof(UserAccount), userId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { email = oldEmail }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { email = newEmail }),
            Reason: request.Reason.Trim()));

        if (!await activationLinks.IssueAsync(newEmail, user.Profile?.FullName ?? string.Empty, member: true, ct))
            throw TooSoon();

        await tx.CommitAsync(ct);
        return await users.GetAsync(userId, ct);
    }

    private async Task<UserAccount> LoadPendingMemberAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Set<UserAccount>()
            .Include(u => u.Role)
            .Include(u => u.Profile)
            .Include(u => u.Credential)
            .Include(u => u.ExternalLogins)
            .SingleOrDefaultAsync(u => u.UserId == userId && u.Role!.RoleName == UserRole.Member, ct)
            ?? throw new NotFoundException("user_not_found", "Member not found.");

        if (user.Credential?.PasswordHash is not null || user.ExternalLogins.Count > 0)
            throw new ConflictException("account_not_pending_activation", "Only members that are waiting for activation can do this.");

        return user;
    }

    private static AppException TooSoon()
        => new(StatusCodes.Status429TooManyRequests, "activation_resend_too_soon",
            $"Wait {AuthService.OtpResendCooldown.TotalSeconds:0} seconds before sending another activation link.");
}
