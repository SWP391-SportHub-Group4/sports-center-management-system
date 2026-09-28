using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Interfaces;

/// <summary>
/// Lớp kiểm tra thứ 2 trong 3 lớp bắt buộc cho Training/AI/Scheduling theo category (BR-96 và
/// kéo theo): role claim (policy) → CoachProfile trong DB (đây) → ownership/relationship (service
/// gọi riêng). Luôn đọc CoachCategory từ DB, không đọc từ JWT — category có thể đổi trong khi
/// token cũ còn hạn.
/// </summary>
public interface ICoachProfileReader
{
    /// <summary>Đọc category nếu có; null khi user không phải Coach hoặc chưa có CoachProfile.</summary>
    Task<CoachCategory?> GetCategoryAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Bắt buộc user tồn tại, có role Coach và có CoachProfile. "Coach thiếu profile" là lỗi
    /// dữ liệu (invariant hỏng — CreateStaffAsync luôn tạo cùng lúc), khác với user không đủ
    /// quyền — ném lỗi riêng và ghi log để phát hiện được invariant hỏng, không lặng lẽ coi
    /// như 403 thông thường.
    /// </summary>
    Task<CoachCategory> RequireCoachWithProfileAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Như trên, và bắt buộc đúng category — ném 403 coach_category_forbidden nếu sai.</summary>
    Task RequireCategoryAsync(Guid userId, CoachCategory required, CancellationToken ct = default);
}
