using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

/// <summary>Payment confirms the obligation; Membership owns activation in the same transaction.</summary>
public sealed class PackageActivationService(IMembershipFulfillment memberships) : IPackageActivationService
{
    public async Task ActivateIfObligationMetAsync(Invoice invoice, InvoiceBalance balance, Guid actorUserId,
        CancellationToken ct = default)
    {
        if (invoice.MemberPackageId is Guid id && balance.IsFullyPaid)
            await memberships.ActivateAsync(id, invoice.InvoiceId, actorUserId, ct);
    }
}
