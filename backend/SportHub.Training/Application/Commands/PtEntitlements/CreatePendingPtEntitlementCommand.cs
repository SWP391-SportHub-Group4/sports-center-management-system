namespace SportHub.Training.Application.Commands;

/// <summary>
/// Command nội bộ của <see cref="Interfaces.IPtEntitlementLifecycle"/> — Payment gọi khi Member
/// checkout PT thành công lần tạo Invoice (trước khi thanh toán xong). Không phải request HTTP.
/// </summary>
public sealed record CreatePendingPtEntitlementCommand(
    Guid MemberId,
    Guid CoachId,
    Guid OriginMemberPackageId,
    int FrequencyPerWeek);
