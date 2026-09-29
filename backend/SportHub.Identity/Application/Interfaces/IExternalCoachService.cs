using SportHub.BuildingBlocks.SharedKernel.Pagination;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;

namespace SportHub.Identity.Application.Interfaces;

public interface IExternalCoachService
{
    /// <summary>Gửi OTP đăng ký ExternalCoach. Email đã có tài khoản thì 409 (như đăng ký Member).</summary>
    Task RequestRegisterOtpAsync(RequestRegisterOtpRequest request, CancellationToken ct = default);

    /// <summary>OTP + tài khoản + hồ sơ PendingApproval + chuyên môn trong một transaction.</summary>
    Task<AuthResponse> RegisterAsync(RegisterExternalCoachRequest request, CancellationToken ct = default);

    Task<ExternalCoachResponse> GetMeAsync(Guid userId, CancellationToken ct = default);

    Task<ExternalCoachResponse> UpdateMeAsync(Guid userId, UpdateExternalCoachProfileRequest request, CancellationToken ct = default);

    Task<PagedResult<ExternalCoachResponse>> SearchAsync(string? status, string? keyword, int page, int pageSize, CancellationToken ct = default);

    Task<ExternalCoachResponse> GetAsync(Guid userId, CancellationToken ct = default);

    Task<ExternalCoachResponse> ApproveAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ExternalCoachResponse> RejectAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ExternalCoachResponse> SuspendAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ExternalCoachResponse> ReactivateAsync(Guid userId, ReviewExternalCoachRequest request, Guid actorUserId, CancellationToken ct = default);
}
