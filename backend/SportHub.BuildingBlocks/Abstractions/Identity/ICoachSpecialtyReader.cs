namespace SportHub.BuildingBlocks.Abstractions.Identity;

/// <summary>
/// Chuyên môn của Coach nội bộ theo môn thể thao (thay CoachCategory cũ). Bản cài đặt ở Identity.
/// Việc môn đó có dạy 1-1 hay không thuộc catalog (<c>ISportCatalogReader</c>), không thuộc port này.
/// </summary>
public interface ICoachSpecialtyReader
{
    /// <summary>True khi user có role Coach và tài khoản Active.</summary>
    Task<bool> IsActiveInternalCoachAsync(Guid coachId, CancellationToken cancellationToken = default);

    Task<bool> HasSportAsync(Guid coachId, int sportId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<int>> GetSportIdsAsync(Guid coachId, CancellationToken cancellationToken = default);

    /// <summary>Coach nội bộ đang Active có chuyên môn môn này (nguồn cho gợi ý coach trống, phân công lớp).</summary>
    /// <summary>Coach nội bộ Active có ít nhất một chuyên môn là môn dạng OneOnOne đang hoạt động (thay CoachCategory.PersonalTrainer).</summary>
    Task<bool> IsPersonalTrainerAsync(Guid coachId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Guid>> GetCoachIdsForSportAsync(int sportId, CancellationToken cancellationToken = default);
}
