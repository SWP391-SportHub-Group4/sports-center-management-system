using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.Training.Application.DTOs.PtEntitlements;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Application.Services;

public sealed class PtPricingService(IMembershipAccessReader memberships, ISystemSettingProvider settings,
    ICoachSpecialtyReader specialties, IClock clock)
{
    public Task<VersionedIntSetting> GetPriceAsync(CancellationToken ct)
        => settings.GetVersionedIntAsync(SystemSettingKeys.PtPricePerSessionVnd, ct);

    public async Task<PtPurchaseQuoteResponse> QuoteAsync(PtPurchaseRequest request, CancellationToken ct)
    {
        var package = await memberships.GetByIdAsync(request.MemberPackageId, ct)
            ?? throw new NotFoundException("membership_not_found", "Membership not found.");
        if (package.MemberId != request.MemberId)
            throw new NotFoundException("membership_not_found", "Membership not found.");
        if (package.Status != "Active" || package.StartDate > VietnamTime.TodayLocal(clock)
            || package.EndDate < VietnamTime.TodayLocal(clock))
            throw new ConflictException("membership_not_active", "Membership not active.");
        if (!await specialties.IsPersonalTrainerAsync(request.CoachId, ct))
            throw new BadRequestException("coach_must_be_personal_trainer", "Coach must be personal trainer.");
        if (request.StartAtUtc is DateTime start)
        {
            if (start.Kind != DateTimeKind.Utc)
                throw new BadRequestException("pt_start_not_utc", "Pt start not utc.");
            PtSlotCalculator.ValidateStart(clock.UtcNow, start);
            if (start < VietnamTime.StartOfDayUtc(package.StartDate)
                || PtSessionRules.EndAtUtc(start) > VietnamTime.EndOfDayExclusiveUtc(package.EndDate))
                throw new ConflictException("pt_session_outside_membership_validity", "Pt session outside membership validity.");
        }
        var quota = request.StartAtUtc.HasValue ? 1 : PtEntitlementRules.ComputeTotalQuota(
            request.FrequencyPerWeek, package.StartDate, package.EndDate);
        var price = await GetPriceAsync(ct);
        if (price.Value <= 0 || price.Value % 1000 != 0)
            throw new InvalidOperationException("The PT unit price must be positive and a multiple of 1,000 VND.");
        return new PtPurchaseQuoteResponse(package.MemberPackageId, request.CoachId,
            request.FrequencyPerWeek, quota, price.Value,
            checked((decimal)quota * price.Value), price.Version, package.EndDate);
    }
}
