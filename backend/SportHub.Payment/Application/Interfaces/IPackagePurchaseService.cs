using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Rules;
using SportHub.Payment.Infrastructure;

namespace SportHub.Payment.Application.Interfaces;

public interface IPackagePurchaseService
{
    Task<InvoiceDetailResponse> PurchaseAsync(
        PurchasePackageRequest request, Guid actorUserId, bool actorIsCenterManager, CancellationToken ct = default);
}
