namespace SportHub.BuildingBlocks.SharedKernel.Pagination;

/// <summary>Kết quả phân trang dùng chung cho toàn bộ module — thay cho việc mỗi module tự định nghĩa lại.</summary>
public sealed class PagedResult<T>
{
    public required IReadOnlyList<T> Items { get; init; }

    public required int Page { get; init; }

    public required int PageSize { get; init; }

    public required int TotalCount { get; init; }
}
