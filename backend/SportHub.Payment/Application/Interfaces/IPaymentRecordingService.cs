using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Payment.Application.Commands;
using SportHub.Payment.Application.DTOs;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Interfaces;

public interface IPaymentRecordingService
{
    Task<InvoiceDetailResponse> RecordAsync(
        Guid invoiceId, RecordPaymentRequest request, Guid actorUserId, CancellationToken ct = default);
}
