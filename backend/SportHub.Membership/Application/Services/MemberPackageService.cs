using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Application.Interfaces;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Membership.Application.Services;

/// <summary>
/// Đọc và huỷ gói đã bán. Việc MUA gói (tạo hoá đơn, BR-30) nằm ở module Payment vì
/// hoá đơn phải được tạo cùng transaction với MemberPackage, và Payment mới là module sở
/// hữu Invoice — Membership tham chiếu ngược Payment sẽ thành vòng.
/// </summary>
public sealed class MemberPackageService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : IMemberPackageService
{
    public async Task<IReadOnlyList<MemberPackageResponse>> GetByMemberAsync(Guid memberId, CancellationToken ct = default)
    {
        var today = MemberPackageRules.Today(clock);

        return await db.Set<MemberPackage>()
            .AsNoTracking()
            .Where(mp => mp.MemberId == memberId)
            .OrderByDescending(mp => mp.StartDate)
            .Select(Projection(today))
            .ToListAsync(ct);
    }

    public async Task<PagedResult<MemberPackageResponse>> SearchAsync(
        string? status,
        string? keyword,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = Math.Clamp(pageSize <= 0 ? 20 : pageSize, 1, 100);

        var today = MemberPackageRules.Today(clock);
        var query = db.Set<MemberPackage>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseStatus(status);
            query = query.Where(mp => mp.Status == parsed);
        }

        if (!string.IsNullOrWhiteSpace(keyword))
        {
            // ToLower().Contains() chứ không phải EF.Functions.ILike: ILike là hàm riêng của
            // provider Npgsql, mà module nghiệp vụ chỉ tham chiếu EF Core Relational —
            // kéo provider vào đây sẽ buộc mọi module biết hệ quản trị CSDL đang dùng.
            var term = keyword.Trim().ToLowerInvariant();
            query = query.Where(mp =>
                mp.Member!.Email.ToLower().Contains(term)
                || (mp.Member.Profile != null && mp.Member.Profile.FullName.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(mp => mp.StartDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(Projection(today))
            .ToListAsync(ct);

        return new PagedResult<MemberPackageResponse>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = total
        };
    }

    public async Task<MemberPackageResponse> CancelAsync(
        Guid memberPackageId,
        string reason,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var package = await db.Set<MemberPackage>()
            .SingleOrDefaultAsync(mp => mp.MemberPackageId == memberPackageId, ct)
            ?? throw new NotFoundException("member_package_not_found", "Không tìm thấy gói của hội viên.");

        // SSOT §4: Cancelled chỉ đến từ PendingPayment hoặc Active. Expired/Cancelled là
        // trạng thái cuối — huỷ tiếp là thao tác vô nghĩa, từ chối thay vì ghi đè im lặng.
        if (package.Status is MemberPackageStatus.Expired or MemberPackageStatus.Cancelled)
        {
            throw new ConflictException(
                "member_package_not_cancellable",
                $"Gói đang ở trạng thái {package.Status}, không thể hủy.");
        }

        var previous = package.Status;
        package.Status = MemberPackageStatus.Cancelled;

        audit.Write(new AuditEntry(
            actorUserId, "CANCEL_MEMBER_PACKAGE", nameof(MemberPackage), memberPackageId.ToString(),
            OldValue: $"{{\"status\":\"{previous}\"}}",
            NewValue: $"{{\"status\":\"{MemberPackageStatus.Cancelled}\"}}",
            Reason: reason.Trim()));

        // Huỷ gói KHÔNG tự động void hoá đơn hay hoàn tiền: hoá đơn không bao giờ bị xoá
        // (BR-40) và hoàn tiền phải đi qua PaymentAdjustment có Manager duyệt (BR-42).
        await db.SaveChangesAsync(ct);

        return await GetOneAsync(memberPackageId, ct);
    }

    public async Task<int> CountUsableAsync(Guid memberId, CancellationToken ct = default)
    {
        var today = MemberPackageRules.Today(clock);

        return await db.Set<MemberPackage>()
            .CountAsync(
                mp => mp.MemberId == memberId
                      && mp.Status == MemberPackageStatus.Active
                      && mp.StartDate <= today
                      && today <= mp.EndDate
                      && (mp.RemainingSessions == null || mp.RemainingSessions > 0),
                ct);
    }

    private async Task<MemberPackageResponse> GetOneAsync(Guid memberPackageId, CancellationToken ct)
    {
        var today = MemberPackageRules.Today(clock);

        return await db.Set<MemberPackage>()
                   .AsNoTracking()
                   .Where(mp => mp.MemberPackageId == memberPackageId)
                   .Select(Projection(today))
                   .SingleOrDefaultAsync(ct)
               ?? throw new NotFoundException("member_package_not_found", "Không tìm thấy gói của hội viên.");
    }

    private static MemberPackageStatus ParseStatus(string status)
        => Enum.TryParse<MemberPackageStatus>(status, ignoreCase: true, out var parsed)
            ? parsed
            : throw new BadRequestException("invalid_status", $"Trạng thái gói không hợp lệ: '{status}'.");

    // IsUsable lặp lại điều kiện BR-9 dưới dạng biểu thức LINQ thay vì gọi
    // MemberPackageRules.IsUsable — hàm C# không dịch được sang SQL. Hai nơi phải khớp nhau;
    // MemberPackageRulesTests khoá định nghĩa gốc.
    private static System.Linq.Expressions.Expression<Func<MemberPackage, MemberPackageResponse>> Projection(DateOnly today)
        => mp => new MemberPackageResponse(
            mp.MemberPackageId,
            mp.MemberId,
            mp.Member!.Email,
            mp.Member.Profile != null ? mp.Member.Profile.FullName : string.Empty,
            mp.PackageId,
            mp.Package!.Name,
            mp.StartDate,
            mp.EndDate,
            mp.RemainingSessions,
            mp.Package.SessionLimit,
            mp.Status.ToString(),
            mp.Status == MemberPackageStatus.Active
            && mp.StartDate <= today
            && today <= mp.EndDate
            && (mp.RemainingSessions == null || mp.RemainingSessions > 0),
            mp.StackingApprovedByUserId != null,
            mp.StackingApprovalReason);
}
