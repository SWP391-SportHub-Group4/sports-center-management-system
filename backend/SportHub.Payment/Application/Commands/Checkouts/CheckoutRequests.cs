using System.ComponentModel.DataAnnotations;

namespace SportHub.Payment.Application.Commands.Checkouts;

public sealed record MembershipCheckoutRequest(
    [param: Range(1, int.MaxValue)] int PackageId,
    Guid? TargetMemberId,
    bool AllowStacking = false,
    string? StackingApprovalReason = null);

public sealed record ClassCheckoutRequest(
    [param: Range(1, int.MaxValue)] int ClassId,
    Guid? TargetMemberId);

