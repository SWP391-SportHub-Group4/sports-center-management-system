using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Membership.Application.Services;

public sealed record MemberBmiProfileResponse(Guid MemberId, string Status, DateTime RequestedAt,
    DateTime? AppointmentAt, decimal? HeightCm, decimal? WeightKg, decimal? Bmi, DateTime? MeasuredAt);

public sealed class MemberBmiProfileService(ISportHubDbContext db, IClock clock)
{
    public async Task<object> RequestsAsync(int page, CancellationToken ct)
    {
        page = Math.Max(1, page);
        var query = db.Set<MemberBmiProfile>().AsNoTracking().Where(p => p.MeasuredAt == null);
        var totalCount = await query.CountAsync(ct);
        var rows = await query.OrderBy(p => p.RequestedAt).ThenBy(p => p.MemberId)
            .Skip((page - 1) * 20).Take(20)
            .Select(p => new { p.MemberId, p.RequestedAt, p.AppointmentAt, MemberName = p.Member!.Profile!.FullName, MemberEmail = p.Member.Email })
            .ToListAsync(ct);
        return new { Items = rows, TotalCount = totalCount, Page = page, PageSize = 20 };
    }
    private static MemberBmiProfileResponse Response(MemberBmiProfile p) => new(p.MemberId,
        p.MeasuredAt.HasValue ? "MEASURED" : p.AppointmentAt.HasValue ? "SCHEDULED" : "REQUESTED",
        p.RequestedAt, p.AppointmentAt, p.HeightCm, p.WeightKg,
        p.HeightCm is > 0 && p.WeightKg.HasValue
            ? Math.Round(p.WeightKg.Value / (p.HeightCm.Value / 100m * p.HeightCm.Value / 100m), 1, MidpointRounding.AwayFromZero)
            : null, p.MeasuredAt);

    public async Task<MemberBmiProfileResponse?> GetAsync(Guid memberId, CancellationToken ct)
    {
        var p = await db.Set<MemberBmiProfile>().AsNoTracking().SingleOrDefaultAsync(p => p.MemberId == memberId, ct);
        return p is null ? null : Response(p);
    }

    public async Task<MemberBmiProfileResponse> RequestAsync(Guid memberId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialise all writes for this member, including duplicate registration clicks.
        await LockAsync(memberId, ct);
        var p = await db.Set<MemberBmiProfile>().SingleOrDefaultAsync(p => p.MemberId == memberId, ct);
        if (p is null)
        {
            p = new MemberBmiProfile { MemberId = memberId, RequestedAt = clock.UtcNow };
            db.Set<MemberBmiProfile>().Add(p);
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return Response(p);
    }

    public async Task<MemberBmiProfileResponse> ScheduleAsync(Guid memberId, DateTime appointmentAt, CancellationToken ct)
    {
        if (appointmentAt.Kind != DateTimeKind.Utc || appointmentAt <= clock.UtcNow)
            throw new BadRequestException("invalid_bmi_appointment", "Lịch đo phải là thời điểm trong tương lai, có múi giờ UTC.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(memberId, ct);
        var p = await PendingAsync(memberId, ct);
        p.AppointmentAt = appointmentAt;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Response(p);
    }

    public async Task<MemberBmiProfileResponse> RecordAsync(Guid memberId, decimal heightCm, decimal weightKg, Guid staffId, CancellationToken ct)
    {
        if (heightCm is < 50 or > 250 || weightKg is < 10 or > 400 ||
            decimal.Round(heightCm, 1) != heightCm || decimal.Round(weightKg, 1) != weightKg)
            throw new BadRequestException("invalid_bmi_measurement", "Chiều cao/cân nặng không hợp lệ; nhập tối đa một chữ số thập phân.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(memberId, ct);
        var p = await PendingAsync(memberId, ct);
        p.HeightCm = heightCm;
        p.WeightKg = weightKg;
        p.MeasuredAt = clock.UtcNow;
        p.RecordedById = staffId;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Response(p);
    }

    private Task<int> LockAsync(Guid memberId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"SELECT user_id FROM user_accounts WHERE user_id = {memberId} FOR UPDATE", ct);

    private async Task<MemberBmiProfile> PendingAsync(Guid memberId, CancellationToken ct)
    {
        var p = await db.Set<MemberBmiProfile>().SingleOrDefaultAsync(p => p.MemberId == memberId, ct)
            ?? throw new NotFoundException("bmi_request_not_found", "Hội viên chưa đăng ký đo BMI.");
        if (p.MeasuredAt.HasValue)
            throw new ConflictException("bmi_profile_locked", "Kết quả BMI đã được ghi nhận và không thể sửa.");
        return p;
    }
}
