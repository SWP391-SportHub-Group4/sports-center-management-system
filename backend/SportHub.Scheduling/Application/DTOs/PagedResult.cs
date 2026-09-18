namespace SportHub.Scheduling.Application.DTOs;

// Lịch sử check-in tăng không giới hạn (BR-64 cho phép nhiều lần mỗi ngày), nên đường
// đọc trả về theo trang thay vì toàn bộ.
public sealed class PagedResult<T>
{
    public required IReadOnlyList<T> Items { get; init; }

    public required int Page { get; init; }

    public required int PageSize { get; init; }

    public required int TotalCount { get; init; }
}
