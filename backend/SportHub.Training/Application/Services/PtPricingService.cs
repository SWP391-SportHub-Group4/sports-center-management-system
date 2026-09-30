using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Training.Application.DTOs.PtEntitlements;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Application.Services;

public sealed class PtPricingService(ISportHubDbContext db, ISystemSettingProvider settings,
    ICoachSpecialtyReader specialties, IClock clock)
{
    public Task<VersionedIntSetting> GetPriceAsync(CancellationToken ct)
        => settings.GetVersionedIntAsync(SystemSettingKeys.PtPricePerSessionVnd, ct);

    public async Task<PtPurchaseQuoteResponse> QuoteAsync(PtPurchaseRequest request, CancellationToken ct)
    {
        var package = await db.Set<MemberPackage>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.MemberPackageId == request.MemberPackageId
                && x.MemberId == request.MemberId, ct)
            ?? throw new NotFoundException("membership_not_found", "Không tìm thấy Membership của hội viên.");
        if (package.Status != MemberPackageStatus.Active || package.EndDate < VietnamTime.TodayLocal(clock))
            throw new ConflictException("membership_not_active", "Membership liên kết phải đang có hiệu lực.");
        if (!await specialties.IsPersonalTrainerAsync(request.CoachId, ct))
            throw new BadRequestException("coach_must_be_personal_trainer", "Coach chưa có chuyên môn PT.");
        var quota = PtEntitlementRules.ComputeTotalQuota(
            request.FrequencyPerWeek, package.StartDate, package.EndDate);
        var price = await GetPriceAsync(ct);
        if (price.Value <= 0 || price.Value % 1000 != 0)
            throw new InvalidOperationException("Đơn giá PT phải là số dương và bội 1.000 VND.");
        return new PtPurchaseQuoteResponse(package.MemberPackageId, request.CoachId,
            request.FrequencyPerWeek, quota, price.Value,
            checked((decimal)quota * price.Value), price.Version, package.EndDate);
    }
}
