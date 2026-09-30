using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Exceptions;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Application.Services;

/// <summary>
/// ExternalCoach (BR-105): tự đăng ký bằng OTP, chờ Manager duyệt. Chỉ Approved mới được thuê sân
/// (kiểm ở <c>IExternalCoachAccessReader</c>); Pending/Rejected/Suspended vẫn xem được hồ sơ và trạng thái của chính mình.
///
/// Máy trạng thái: Pending → Approved | Rejected; Approved → Suspended; Suspended → Approved (mở lại).
/// Mọi chuyển trạng thái là UPDATE có điều kiện trên trạng thái cũ, ghi audit và email outbox cùng transaction.
/// Đình chỉ không tự hủy lượt thuê đã Confirmed (BR-129).
///
/// Ví điểm được tạo qua port trong cùng transaction đăng ký.
/// </summary>
public sealed class ExternalCoachService(
    ISportHubDbContext db,
    IPasswordHasher passwordHasher,
    INotificationWriter notifications,
    IAuditWriter audit,
    ISportCatalogReader catalog,
    SportHub.BuildingBlocks.Abstractions.Wallet.IPointWalletService wallets,
    EmailOtpFlow otpFlow,
    IOptions<JwtOptions> jwtOptions,
    IClock clock) : IExternalCoachService
{
    private const int MaxPageSize = 100;

    public async Task RequestRegisterOtpAsync(RequestRegisterOtpRequest request, CancellationToken ct = default)
    {
        var email = request.Email.Trim();

        if (await db.Set<UserAccount>().AnyAsync(u => u.Email == email, ct))
        {
            throw new EmailAlreadyExistsException();
        }

        var code = await otpFlow.IssueAsync(email, EmailOtpPurpose.ExternalCoachRegister, ct)
                   ?? throw new AppException(
                       StatusCodes.Status429TooManyRequests,
                       "otp_resend_too_soon",
                       $"Vui lòng đợi {AuthService.OtpResendCooldown.TotalSeconds:0} giây trước khi yêu cầu mã mới.");

        // EmailOtpFlow atomically enqueues the encrypted outbox message with this OTP.
    }

    public async Task<AuthResponse> RegisterAsync(RegisterExternalCoachRequest request, CancellationToken ct = default)
    {
        PasswordPolicyGuard.EnforceConfirmation(request.Password, request.ConfirmPassword);

        var email = request.Email.Trim();
        var fullName = request.FullName.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        var bio = string.IsNullOrWhiteSpace(request.Bio) ? null : request.Bio.Trim();

        PasswordPolicyGuard.Enforce(request.Password, email);

        var sportIds = request.SportIds.Distinct().ToList();
        await EnsureSportsActiveAsync(sportIds, ct);

        var otpId = await otpFlow.VerifyAsync(email, EmailOtpPurpose.ExternalCoachRegister, request.OtpCode, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        await otpFlow.ConsumeAsync(otpId, ct);

        if (await db.Set<UserAccount>().AnyAsync(u => u.Email == email, ct))
        {
            throw new EmailAlreadyExistsException();
        }

        if (phone is not null && await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
        {
            throw new PhoneAlreadyExistsException();
        }

        var role = await db.Set<Role>().SingleAsync(r => r.RoleName == UserRole.ExternalCoach, ct);
        var now = clock.UtcNow;

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = now,
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(request.Password) },
            Profile = new UserProfile { FullName = fullName, Phone = phone }
        };

        db.Set<UserAccount>().Add(user);
        db.Set<ExternalCoachProfile>().Add(new ExternalCoachProfile
        {
            UserId = user.UserId,
            Bio = bio,
            ApprovalStatus = ExternalCoachApprovalStatus.PendingApproval,
            CreatedAt = now
        });
        db.Set<UserSportSpecialty>().AddRange(
            sportIds.Select(id => new UserSportSpecialty { UserId = user.UserId, SportId = id }));

        audit.Write(new AuditEntry(
            user.UserId,
            "REGISTER_EXTERNAL_COACH",
            nameof(ExternalCoachProfile),
            user.UserId.ToString(),
            NewValue: "{\"status\":\"PendingApproval\",\"sportIds\":[" + string.Join(",", sportIds) + "]}"));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException
                                           {
                                               SqlState: PostgresErrorCodes.UniqueViolation
                                           } pg)
        {
            throw pg.ConstraintName == "ix_user_profiles_phone"
                ? new PhoneAlreadyExistsException()
                : new EmailAlreadyExistsException();
        }

        await wallets.EnsureWalletAsync(user.UserId, ct);
        await tx.CommitAsync(ct);

        user.Role = role;

        return new AuthResponse
        {
            AccessToken = JwtService.GenerateAccessToken(
                user.UserId, role.RoleName.ToString(), jwtOptions.Value, user.SecurityStamp),
            User = new UserSummaryResponse
            {
                UserId = user.UserId,
                Email = email,
                FullName = fullName,
                Role = role.RoleName.ToString(),
                ApprovalStatus = ExternalCoachApprovalStatus.PendingApproval.ToString(),
                SportIds = sportIds
            },
            IsNewAccount = true
        };
    }

    public async Task<ExternalCoachResponse> GetMeAsync(Guid userId, CancellationToken ct = default)
        => await GetAsync(userId, ct);

    public async Task<ExternalCoachResponse> UpdateMeAsync(
        Guid userId, UpdateExternalCoachProfileRequest request, CancellationToken ct = default)
    {
        var profile = await db.Set<ExternalCoachProfile>().SingleOrDefaultAsync(p => p.UserId == userId, ct)
                      ?? throw new NotFoundException("external_coach_not_found", "Không tìm thấy hồ sơ Coach ngoài.");

        profile.Bio = string.IsNullOrWhiteSpace(request.Bio) ? null : request.Bio.Trim();
        await db.SaveChangesAsync(ct);

        return await GetAsync(userId, ct);
    }

    public async Task<PagedResult<ExternalCoachResponse>> SearchAsync(
        string? status, string? keyword, int page, int pageSize, CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, MaxPageSize);

        var query = db.Set<ExternalCoachProfile>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseStatus(status);
            query = query.Where(p => p.ApprovalStatus == parsed);
        }

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(p =>
                p.UserAccount!.Email.ToLower().Contains(term)
                || (p.UserAccount.Profile != null && p.UserAccount.Profile.FullName.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(ct);

        var rows = await query
            .OrderBy(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(Projection())
            .ToListAsync(ct);

        var ids = rows.Select(r => r.UserId).ToList();
        var specialties = (await db.Set<UserSportSpecialty>()
                .AsNoTracking()
                .Where(s => ids.Contains(s.UserId))
                .Select(s => new { s.UserId, s.SportId })
                .ToListAsync(ct))
            .ToLookup(s => s.UserId, s => s.SportId);

        return new PagedResult<ExternalCoachResponse>
        {
            Items = rows.Select(r => r with { SportIds = specialties[r.UserId].OrderBy(x => x).ToList() }).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<ExternalCoachResponse> GetAsync(Guid userId, CancellationToken ct = default)
    {
        var row = await db.Set<ExternalCoachProfile>()
                      .AsNoTracking()
                      .Where(p => p.UserId == userId)
                      .Select(Projection())
                      .SingleOrDefaultAsync(ct)
                  ?? throw new NotFoundException("external_coach_not_found", "Không tìm thấy hồ sơ Coach ngoài.");

        var sportIds = await db.Set<UserSportSpecialty>()
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => s.SportId)
            .OrderBy(x => x)
            .ToListAsync(ct);

        return row with { SportIds = sportIds };
    }

    public Task<ExternalCoachResponse> ApproveAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default)
        => TransitionAsync(userId, ExternalCoachApprovalStatus.PendingApproval, ExternalCoachApprovalStatus.Approved,
            "APPROVE_EXTERNAL_COACH", request.Note, noteRequired: false, actorUserId, ct);

    public Task<ExternalCoachResponse> RejectAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default)
        => TransitionAsync(userId, ExternalCoachApprovalStatus.PendingApproval, ExternalCoachApprovalStatus.Rejected,
            "REJECT_EXTERNAL_COACH", request.Note, noteRequired: true, actorUserId, ct);

    public Task<ExternalCoachResponse> SuspendAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default)
        => TransitionAsync(userId, ExternalCoachApprovalStatus.Approved, ExternalCoachApprovalStatus.Suspended,
            "SUSPEND_EXTERNAL_COACH", request.Note, noteRequired: true, actorUserId, ct);

    public Task<ExternalCoachResponse> ReactivateAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default)
        => TransitionAsync(userId, ExternalCoachApprovalStatus.Suspended, ExternalCoachApprovalStatus.Approved,
            "REACTIVATE_EXTERNAL_COACH", request.Note, noteRequired: false, actorUserId, ct);

    private async Task<ExternalCoachResponse> TransitionAsync(
        Guid userId,
        ExternalCoachApprovalStatus from,
        ExternalCoachApprovalStatus to,
        string auditAction,
        string? rawNote,
        bool noteRequired,
        Guid actorUserId,
        CancellationToken ct)
    {
        var note = string.IsNullOrWhiteSpace(rawNote) ? null : rawNote.Trim();

        if (noteRequired && (note is null || note.Length < 3))
        {
            throw new BadRequestException("review_note_required", "Phải ghi lý do (tối thiểu 3 ký tự) khi từ chối hoặc đình chỉ.");
        }

        var exists = await db.Set<ExternalCoachProfile>().AnyAsync(p => p.UserId == userId, ct);
        if (!exists)
        {
            throw new NotFoundException("external_coach_not_found", "Không tìm thấy hồ sơ Coach ngoài.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var now = clock.UtcNow;

        // UPDATE có điều kiện trên trạng thái cũ: hai Manager thao tác đồng thời thì chỉ một bên thắng.
        var updated = await db.Set<ExternalCoachProfile>()
            .Where(p => p.UserId == userId && p.ApprovalStatus == from)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.ApprovalStatus, to)
                .SetProperty(p => p.ReviewedByUserId, actorUserId)
                .SetProperty(p => p.ReviewedAt, now)
                .SetProperty(p => p.ReviewNote, note), ct);

        if (updated == 0)
        {
            throw new ConflictException(
                "invalid_approval_transition",
                $"Chỉ có thể chuyển hồ sơ từ {from} sang {to}; trạng thái hiện tại đã khác.");
        }

        audit.Write(new AuditEntry(
            actorUserId,
            auditAction,
            nameof(ExternalCoachProfile),
            userId.ToString(),
            OldValue: "{\"status\":\"" + from + "\"}",
            NewValue: "{\"status\":\"" + to + "\"}",
            Reason: note));

        var user = await db.Set<UserAccount>().AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var (subject, body) = ReviewEmail(to, note);
        notifications.QueueEmail(new EmailNotificationRequest(userId, user.Email,
            NotificationEvents.ExternalCoachReviewed, Guid.NewGuid(), subject, "<p>" + body + "</p>"));

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetAsync(userId, ct);
    }

    private static (string Subject, string Body) ReviewEmail(ExternalCoachApprovalStatus status, string? note)
    {
        var (subject, body) = status switch
        {
            ExternalCoachApprovalStatus.Approved => ("SportHub - Hồ sơ Coach ngoài đã được duyệt",
                "Hồ sơ của bạn đã được duyệt. Bạn có thể đặt thuê sân trên SportHub."),
            ExternalCoachApprovalStatus.Rejected => ("SportHub - Hồ sơ Coach ngoài bị từ chối",
                "Hồ sơ của bạn bị từ chối. Lý do: " + System.Net.WebUtility.HtmlEncode(note)),
            _ => ("SportHub - Hồ sơ Coach ngoài bị đình chỉ",
                "Hồ sơ của bạn đang bị đình chỉ. Lý do: " + System.Net.WebUtility.HtmlEncode(note))
        };

        return (subject, body);
    }

    private async Task EnsureSportsActiveAsync(IReadOnlyList<int> sportIds, CancellationToken ct)
    {
        foreach (var sportId in sportIds)
        {
            var sport = await catalog.GetSportAsync(sportId, ct);
            if (sport is null || !sport.IsActive)
            {
                throw new BadRequestException("invalid_sport", $"Môn không tồn tại hoặc đã ngừng hoạt động: {sportId}.");
            }
        }
    }

    private static ExternalCoachApprovalStatus ParseStatus(string status)
        => Enum.TryParse<ExternalCoachApprovalStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", $"Trạng thái không hợp lệ: '{status}'.");

    private static System.Linq.Expressions.Expression<Func<ExternalCoachProfile, ExternalCoachResponse>> Projection()
        => p => new ExternalCoachResponse(
            p.UserId,
            p.UserAccount!.Email,
            p.UserAccount.Profile != null ? p.UserAccount.Profile.FullName : string.Empty,
            p.UserAccount.Profile != null ? p.UserAccount.Profile.Phone : null,
            p.Bio,
            p.ApprovalStatus.ToString(),
            new List<int>(),
            p.ReviewedByUserId,
            p.ReviewedAt,
            p.ReviewNote,
            p.CreatedAt);
}
