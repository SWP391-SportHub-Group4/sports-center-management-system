namespace SportHub.BuildingBlocks.SharedKernel.Time;

/// <summary>
/// Đồng hồ hệ thống, tiêm được để test kiểm soát mốc thời gian.
/// Mọi nghiệp vụ so mốc (hạn hủy BR-50, hạn hóa đơn BR-55, No-show BR-20) phải đi qua đây
/// thay vì gọi thẳng DateTime.UtcNow — nếu không, không viết được test cho các mốc đó.
/// </summary>
public interface IClock
{
    DateTime UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
