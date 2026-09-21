using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Membership.Application.DTOs;

namespace SportHub.Membership.Application.Services;

public interface IMembershipPackageService
{
    Task<IReadOnlyList<MembershipPackageDto>> GetAllAsync(bool includeInactive, CancellationToken ct = default);

    Task<MembershipPackageDto> CreateAsync(SaveMembershipPackageRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<MembershipPackageDto> UpdateAsync(int packageId, SaveMembershipPackageRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<MembershipPackageDto> SetActiveAsync(int packageId, bool isActive, Guid actorUserId, CancellationToken ct = default);
}

/// <summary>
/// Danh mục gói thành viên — BR-8 (chỉ Center Manager tạo/sửa/ngừng áp dụng),
/// BR-56 (Name unique toàn danh mục).
/// </summary>
public sealed class MembershipPackageService(
    ISportHubDbContext db,
    IAuditWriter audit) : IMembershipPackageService
{
    public async Task<IReadOnlyList<MembershipPackageDto>> GetAllAsync(
        bool includeInactive,
        CancellationToken ct = default)
    {
        var query = db.Set<MembershipPackage>().AsNoTracking();

        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive);
        }

        return await query
            .OrderBy(p => p.Price)
            .Select(p => new MembershipPackageDto(
                p.PackageId, p.Name, p.Price, p.DurationDays, p.SessionLimit, p.Description, p.IsActive))
            .ToListAsync(ct);
    }

    public async Task<MembershipPackageDto> CreateAsync(
        SaveMembershipPackageRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var package = new MembershipPackage
        {
            Name = request.Name.Trim(),
            Price = decimal.Truncate(request.Price), // VND nguyên (SSOT §5.2)
            DurationDays = request.DurationDays,
            SessionLimit = request.SessionLimit,
            Description = request.Description?.Trim(),
            IsActive = true
        };

        // PackageId là int do DB sinh nên chỉ biết được sau khi INSERT — mà audit lại cần nó
        // làm TargetId. Mở transaction tường minh và SaveChanges hai lần bên trong: vẫn là một
        // đơn vị nguyên tử, không có cửa sổ nào tạo được gói mà thiếu log (BR-7).
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Set<MembershipPackage>().Add(package);
        await SaveAsync(ct);

        audit.Write(new AuditEntry(
            actorUserId, "CREATE_MEMBERSHIP_PACKAGE", nameof(MembershipPackage), package.PackageId.ToString(),
            NewValue: Describe(package)));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return Map(package);
    }

    public async Task<MembershipPackageDto> UpdateAsync(
        int packageId,
        SaveMembershipPackageRequest request,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var package = await db.Set<MembershipPackage>().SingleOrDefaultAsync(p => p.PackageId == packageId, ct)
            ?? throw new NotFoundException("membership_package_not_found", "Không tìm thấy gói thành viên.");

        var before = Describe(package);

        // Sửa Price/DurationDays/SessionLimit KHÔNG hồi tố lên MemberPackage đã bán: những
        // giá trị đó đã được chụp sang MemberPackage (EndDate, RemainingSessions) lúc kích hoạt,
        // và hoá đơn đã phát hành thì không sửa được (BR-40).
        package.Name = request.Name.Trim();
        package.Price = decimal.Truncate(request.Price);
        package.DurationDays = request.DurationDays;
        package.SessionLimit = request.SessionLimit;
        package.Description = request.Description?.Trim();

        audit.Write(new AuditEntry(
            actorUserId, "UPDATE_MEMBERSHIP_PACKAGE", nameof(MembershipPackage), packageId.ToString(),
            OldValue: before, NewValue: Describe(package)));

        await SaveAsync(ct);

        return Map(package);
    }

    public async Task<MembershipPackageDto> SetActiveAsync(
        int packageId,
        bool isActive,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var package = await db.Set<MembershipPackage>().SingleOrDefaultAsync(p => p.PackageId == packageId, ct)
            ?? throw new NotFoundException("membership_package_not_found", "Không tìm thấy gói thành viên.");

        var before = Describe(package);
        package.IsActive = isActive;

        audit.Write(new AuditEntry(
            actorUserId,
            isActive ? "REACTIVATE_MEMBERSHIP_PACKAGE" : "DISCONTINUE_MEMBERSHIP_PACKAGE",
            nameof(MembershipPackage), packageId.ToString(),
            OldValue: before, NewValue: Describe(package)));

        await SaveAsync(ct);

        return Map(package);
    }

    // BR-56 được thực thi bằng unique index; bắt lại lỗi Postgres để trả 409 có nghĩa thay vì 500.
    // Không kiểm tra trước bằng SELECT: hai request đồng thời vẫn lọt qua kiểm tra đó.
    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
                  && pg.ConstraintName is not null
                  && pg.ConstraintName.Contains("membership_packages", StringComparison.Ordinal))
        {
            throw new ConflictException("package_name_taken", "Đã có gói thành viên trùng tên (BR-56).");
        }
    }

    private static string Describe(MembershipPackage p)
        => $"{{\"name\":{System.Text.Json.JsonSerializer.Serialize(p.Name)},\"price\":{p.Price},"
           + $"\"durationDays\":{p.DurationDays},\"sessionLimit\":{(p.SessionLimit?.ToString() ?? "null")},"
           + $"\"isActive\":{p.IsActive.ToString().ToLowerInvariant()}}}";

    private static MembershipPackageDto Map(MembershipPackage p)
        => new(p.PackageId, p.Name, p.Price, p.DurationDays, p.SessionLimit, p.Description, p.IsActive);
}
