using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Services;

public interface IEnrollmentService
{
    Task<EnrollmentResponse> CreateAsync(
        CreateEnrollmentRequest request, Guid memberId, Guid actorUserId, CancellationToken ct = default);

    Task<EnrollmentResponse> CancelAsync(Guid enrollmentId, Guid actorUserId, CancellationToken ct = default);

    Task<IReadOnlyList<EnrollmentResponse>> GetByMemberAsync(
        Guid memberId, bool upcomingOnly, CancellationToken ct = default);

    Task<EnrollmentResponse> GetAsync(Guid enrollmentId, CancellationToken ct = default);

    Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(
        Guid memberId, DateOnly fromDate, DateOnly toDate, string? discipline, CancellationToken ct = default);
}

/// <summary>
/// Đăng ký lớp — BR-16 (gói phải Active và còn số dư), BR-19 (không đăng ký trùng buổi),
/// BR-13 (không vượt sức chứa), BR-50 (chụp hạn hủy), BR-17/BR-18 (hủy và hoàn lượt).
/// </summary>
public sealed class EnrollmentService(
    ISportHubDbContext db,
    ISystemSettingProvider settings,
    ICoachRelationshipRegistrar coachRelationships,
    IAuditWriter audit,
    IClock clock) : IEnrollmentService
{
    public async Task<EnrollmentResponse> CreateAsync(
        CreateEnrollmentRequest request,
        Guid memberId,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var today = VietnamTime.TodayLocal(clock);

        // BR-50 — đọc cấu hình NGAY TẠI ĐÂY để chụp vào đăng ký. Đọc lúc hủy (như Design v2
        // §3.1 mô tả) sẽ khiến Manager đổi cấu hình là đổi luôn điều kiện của đăng ký cũ.
        var deadlineHours = await settings.GetIntAsync(SystemSettingKeys.CancellationDeadlineHours, ct);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var session = await db.Set<ClassSession>()
            .Include(s => s.Class)
            .SingleOrDefaultAsync(s => s.SessionId == request.SessionId, ct)
            ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

        if (session.Status != ClassSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "session_not_open", $"Buổi học đang ở trạng thái {session.Status}, không nhận đăng ký.");
        }

        if (session.StartAtUtc <= now)
        {
            throw new ConflictException("session_already_started", "Buổi học đã bắt đầu, không đăng ký được nữa.");
        }

        // BR-19 — tối đa một đăng ký đang hoạt động cho mỗi buổi. Partial unique index trong DB
        // là nơi chặn thật (hai request đồng thời); kiểm ở đây để trả lỗi có nghĩa.
        var alreadyEnrolled = await db.Set<Enrollment>().AnyAsync(
            e => e.SessionId == request.SessionId
                 && e.MemberId == memberId
                 && e.Status == EnrollmentStatus.Confirmed,
            ct);

        if (alreadyEnrolled)
        {
            throw new ConflictException("already_enrolled", "Bạn đã đăng ký buổi học này rồi (BR-19).");
        }

        // Trùng lịch cá nhân: không có BR nào cấm, nhưng đăng ký hai buổi cùng giờ là dữ liệu
        // sai nghiệp vụ và chắc chắn sinh ra một No-show (quyết định C5 — CẦN DUYỆT).
        var hasConflict = await db.Set<Enrollment>().AnyAsync(
            e => e.MemberId == memberId
                 && e.Status == EnrollmentStatus.Confirmed
                 && e.Session!.Status == ClassSessionStatus.Scheduled
                 && e.Session.StartAtUtc < session.EndAtUtc
                 && session.StartAtUtc < e.Session.EndAtUtc,
            ct);

        if (hasConflict)
        {
            throw new ConflictException(
                "member_schedule_conflict", "Bạn đã có buổi học khác trùng giờ với buổi này.");
        }

        var package = await ResolvePackageAsync(memberId, request.MemberPackageId, today, ct);

        // BR-16 — trừ lượt. TryConsumeSession kiểm lại BR-9 một lần nữa và tự chuyển gói sang
        // Expired khi vừa hết buổi (BR-11), nên không cần lặp lại logic đó ở đây.
        if (!MemberPackageRules.TryConsumeSession(package, today))
        {
            throw new ConflictException(
                "no_usable_package", "Gói thành viên không còn hiệu lực hoặc đã hết số buổi (BR-16).");
        }

        // BR-13 — tăng ConfirmedCount NGUYÊN TỬ bằng một câu UPDATE có điều kiện, thay vì
        // đọc-rồi-ghi. Đọc-rồi-ghi để hở khe cho hai người cuối cùng cùng thấy còn một chỗ và
        // cùng được nhận; điều kiện confirmed_count < capacity nằm trong chính câu UPDATE thì
        // chỉ một trong hai đổi được dòng.
        var seatTaken = await db.Set<ClassSession>()
            .Where(s => s.SessionId == request.SessionId && s.ConfirmedCount < s.Capacity)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ConfirmedCount, x => x.ConfirmedCount + 1), ct);

        if (seatTaken == 0)
        {
            throw new ConflictException("session_full", "Buổi học đã đủ số lượng đăng ký (BR-13).");
        }

        var enrollment = new Enrollment
        {
            EnrollmentId = Guid.NewGuid(),
            SessionId = request.SessionId,
            MemberId = memberId,
            MemberPackageId = package.MemberPackageId,
            Status = EnrollmentStatus.Confirmed,
            RegisteredAt = now,

            // BR-50 — snapshot bất biến của chính sách hủy.
            CancellationDeadlineHours = deadlineHours
        };

        db.Set<Enrollment>().Add(enrollment);

        // SSOT §3 — RelationshipSourceType.ClassBased: hội viên có đăng ký xác nhận vào lớp
        // của một HLV thì quan hệ huấn luyện phát sinh từ đó. Đây là điều kiện để HLV lập kế
        // hoạch tập cho họ (BR-23), nên phải nằm trong cùng transaction với đăng ký.
        await coachRelationships.EnsureClassBasedAsync(session.CoachId, memberId, session.ClassId, ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_ENROLLMENT", nameof(Enrollment), enrollment.EnrollmentId.ToString(),
            NewValue: $"{{\"sessionId\":\"{request.SessionId}\",\"memberId\":\"{memberId}\","
                      + $"\"memberPackageId\":\"{package.MemberPackageId}\","
                      + $"\"cancellationDeadlineHours\":{deadlineHours}}}"));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Partial unique index của BR-19 bắt được ca hai request đồng thời lọt qua kiểm tra ở trên.
            throw new ConflictException("already_enrolled", "Bạn đã đăng ký buổi học này rồi (BR-19).");
        }

        await transaction.CommitAsync(ct);

        return await GetAsync(enrollment.EnrollmentId, ct);
    }

    /// <summary>
    /// BR-17/BR-18 — hủy đăng ký. Đúng hạn (tại hoặc trước mốc BR-50) thì hoàn lượt; trễ hạn
    /// thì không. Mốc tính theo số giờ đã CHỤP vào đăng ký, không phải cấu hình hiện hành.
    /// </summary>
    public async Task<EnrollmentResponse> CancelAsync(
        Guid enrollmentId,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var enrollment = await db.Set<Enrollment>()
            .Include(e => e.Session)
            .SingleOrDefaultAsync(e => e.EnrollmentId == enrollmentId, ct)
            ?? throw new NotFoundException("enrollment_not_found", "Không tìm thấy đăng ký.");

        if (enrollment.Status != EnrollmentStatus.Confirmed)
        {
            throw new ConflictException(
                "enrollment_already_cancelled", $"Đăng ký đang ở trạng thái {enrollment.Status}.");
        }

        var now = clock.UtcNow;

        // Buổi đã bắt đầu thì không còn là "hủy" nữa — kết quả đúng là No-show do job sinh
        // sau khi buổi kết thúc (BR-20), không phải một lần hủy trễ ghi tay.
        if (enrollment.Session!.StartAtUtc <= now)
        {
            throw new ConflictException(
                "session_already_started",
                "Buổi học đã bắt đầu — không hủy được. Kết quả sẽ được ghi nhận qua điểm danh (BR-20).");
        }

        var status = SessionRules.ClassifyCancellation(
            now, enrollment.Session.StartAtUtc, enrollment.CancellationDeadlineHours);

        enrollment.Status = status;
        enrollment.CancelledAt = now;
        enrollment.CancelledByUserId = actorUserId;

        // Giải phóng chỗ bất kể đúng hay trễ hạn: chỗ ngồi vật lý được trả lại trong cả hai
        // trường hợp; cái khác nhau là có hoàn LƯỢT TẬP hay không.
        await db.Set<ClassSession>()
            .Where(s => s.SessionId == enrollment.SessionId && s.ConfirmedCount > 0)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ConfirmedCount, x => x.ConfirmedCount - 1), ct);

        var refunded = false;

        // BR-18 — chỉ hủy ĐÚNG HẠN mới hoàn lượt.
        if (status == EnrollmentStatus.CancelledOnTime)
        {
            var package = await db.Set<MemberPackage>()
                .SingleOrDefaultAsync(mp => mp.MemberPackageId == enrollment.MemberPackageId, ct);

            if (package is not null)
            {
                MemberPackageRules.RestoreSession(package, VietnamTime.TodayLocal(clock));
                refunded = true;
            }
        }

        audit.Write(new AuditEntry(
            actorUserId, "CANCEL_ENROLLMENT", nameof(Enrollment), enrollmentId.ToString(),
            OldValue: $"{{\"status\":\"{EnrollmentStatus.Confirmed}\"}}",
            NewValue: $"{{\"status\":\"{status}\",\"sessionRefunded\":{refunded.ToString().ToLowerInvariant()},"
                      + $"\"deadlineHours\":{enrollment.CancellationDeadlineHours}}}"));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetAsync(enrollmentId, ct);
    }

    public async Task<IReadOnlyList<EnrollmentResponse>> GetByMemberAsync(
        Guid memberId,
        bool upcomingOnly,
        CancellationToken ct = default)
    {
        var query = db.Set<Enrollment>().AsNoTracking().Where(e => e.MemberId == memberId);

        if (upcomingOnly)
        {
            var now = clock.UtcNow;
            query = query.Where(e => e.Session!.EndAtUtc >= now && e.Status == EnrollmentStatus.Confirmed);
        }

        return await query
            .OrderByDescending(e => e.Session!.StartAtUtc)
            .Select(Projection())
            .ToListAsync(ct);
    }

    public async Task<EnrollmentResponse> GetAsync(Guid enrollmentId, CancellationToken ct = default)
        => await db.Set<Enrollment>().AsNoTracking().Where(e => e.EnrollmentId == enrollmentId).Select(Projection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("enrollment_not_found", "Không tìm thấy đăng ký.");

    /// <summary>Lịch lớp kèm tình trạng đăng ký của chính hội viên — màn hình đặt lịch.</summary>
    public async Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(
        Guid memberId,
        DateOnly fromDate,
        DateOnly toDate,
        string? discipline,
        CancellationToken ct = default)
    {
        if (toDate < fromDate)
        {
            (fromDate, toDate) = (toDate, fromDate);
        }

        var fromUtc = VietnamTime.StartOfDayUtc(fromDate);
        var toUtc = VietnamTime.EndOfDayExclusiveUtc(toDate);

        var query = db.Set<ClassSession>()
            .AsNoTracking()
            .Where(s => s.StartAtUtc >= fromUtc
                        && s.StartAtUtc < toUtc
                        && s.Status == ClassSessionStatus.Scheduled);

        if (!string.IsNullOrWhiteSpace(discipline))
        {
            query = query.Where(s => s.Class!.Discipline == discipline);
        }

        return await query
            .OrderBy(s => s.StartAtUtc)
            .Select(s => new MemberSessionResponse(
                new ClassSessionResponse(
                    s.SessionId, s.ClassId, s.Class!.Name, s.Class.Discipline,
                    s.RoomId, s.Room!.Name, s.CoachId,
                    s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email,
                    s.StartAtUtc, s.EndAtUtc, s.Capacity, s.BaselineCapacity, s.ConfirmedCount,
                    s.Status.ToString(), s.RescheduledFromSessionId, s.ConfirmedCount >= s.Capacity),
                s.Enrollments
                    .Where(e => e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed)
                    .Select(e => (Guid?)e.EnrollmentId)
                    .FirstOrDefault(),
                s.Enrollments
                    .Where(e => e.MemberId == memberId && e.Status == EnrollmentStatus.Confirmed)
                    .Select(e => e.Status.ToString())
                    .FirstOrDefault()))
            .ToListAsync(ct);
    }

    /// <summary>
    /// Chọn gói để trừ lượt. Khi hội viên không chỉ định, lấy gói dùng được có EndDate SỚM
    /// NHẤT — tiêu hết gói sắp hết hạn trước thì lượt tập ít bị mất trắng hơn.
    /// </summary>
    private async Task<MemberPackage> ResolvePackageAsync(
        Guid memberId,
        Guid? memberPackageId,
        DateOnly today,
        CancellationToken ct)
    {
        if (memberPackageId is not null)
        {
            var chosen = await db.Set<MemberPackage>()
                .SingleOrDefaultAsync(mp => mp.MemberPackageId == memberPackageId, ct)
                ?? throw new NotFoundException("member_package_not_found", "Không tìm thấy gói thành viên.");

            if (chosen.MemberId != memberId)
            {
                throw new ForbiddenException("member_package_not_owned", "Gói này không thuộc về hội viên.");
            }

            return chosen;
        }

        var candidates = await db.Set<MemberPackage>()
            .Where(mp => mp.MemberId == memberId && mp.Status == MemberPackageStatus.Active)
            .OrderBy(mp => mp.EndDate)
            .ToListAsync(ct);

        return candidates.FirstOrDefault(mp => MemberPackageRules.IsUsable(mp, today))
               ?? throw new ConflictException(
                   "no_usable_package",
                   "Hội viên không có gói thành viên nào đang hoạt động và còn số buổi (BR-16).");
    }

    private static System.Linq.Expressions.Expression<Func<Enrollment, EnrollmentResponse>> Projection()
        => e => new EnrollmentResponse(
            e.EnrollmentId,
            e.SessionId,
            e.MemberId,
            e.Member!.Email,
            e.Member.Profile != null ? e.Member.Profile.FullName : string.Empty,
            e.MemberPackageId,
            e.Status.ToString(),
            e.RegisteredAt,
            e.CancelledAt,
            e.CancellationDeadlineHours,
            e.Session!.StartAtUtc.AddHours(-e.CancellationDeadlineHours),
            e.Attendance == null ? null : e.Attendance.Status.ToString(),
            new ClassSessionResponse(
                e.Session.SessionId, e.Session.ClassId, e.Session.Class!.Name, e.Session.Class.Discipline,
                e.Session.RoomId, e.Session.Room!.Name, e.Session.CoachId,
                e.Session.Coach!.Profile != null ? e.Session.Coach.Profile.FullName : e.Session.Coach.Email,
                e.Session.StartAtUtc, e.Session.EndAtUtc, e.Session.Capacity, e.Session.BaselineCapacity,
                e.Session.ConfirmedCount, e.Session.Status.ToString(), e.Session.RescheduledFromSessionId,
                e.Session.ConfirmedCount >= e.Session.Capacity));
}
