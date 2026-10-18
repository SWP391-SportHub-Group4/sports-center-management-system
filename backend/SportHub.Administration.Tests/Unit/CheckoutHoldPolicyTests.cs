using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Administration.Tests.Unit;

/// <summary>
/// BR-115 — hold.minutes chỉ hợp lệ trong 10–30 phút (mặc định 15). Mọi luồng checkout đọc qua
/// <see cref="CheckoutHoldPolicy"/> nên giá trị ngoài khoảng (ví dụ dữ liệu cũ chưa chuẩn hóa) bị từ chối thay vì
/// tạo hold quá ngắn hoặc quá dài.
/// </summary>
public class CheckoutHoldPolicyTests
{
    [Fact]
    public void Policy_range_is_10_to_30_with_default_15()
    {
        Assert.Equal(10, CheckoutHoldPolicy.MinMinutes);
        Assert.Equal(30, CheckoutHoldPolicy.MaxMinutes);
        Assert.Equal(15, CheckoutHoldPolicy.DefaultMinutes);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(15)]
    [InlineData(30)]
    public async Task Values_inside_range_are_returned(int configured)
    {
        var minutes = await CheckoutHoldPolicy.ReadMinutesAsync(new FakeSettings(configured), CancellationToken.None);

        Assert.Equal(configured, minutes);
    }

    [Theory]
    [InlineData(int.MinValue)]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(9)]
    [InlineData(31)]
    [InlineData(60)]
    [InlineData(1440)]
    public async Task Values_outside_range_are_rejected(int configured)
    {
        var error = await Assert.ThrowsAsync<ConflictException>(() =>
            CheckoutHoldPolicy.ReadMinutesAsync(new FakeSettings(configured), CancellationToken.None));

        Assert.Equal("hold_setting_invalid", error.ErrorCode);
    }

    [Fact]
    public async Task Policy_reads_the_hold_minutes_key()
    {
        var settings = new FakeSettings(15);

        await CheckoutHoldPolicy.ReadMinutesAsync(settings, CancellationToken.None);

        Assert.Equal(SystemSettingKeys.HoldMinutes, settings.LastKey);
    }

    private sealed class FakeSettings(int value) : ISystemSettingProvider
    {
        public string? LastKey { get; private set; }

        public Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default)
        {
            LastKey = key;
            return Task.FromResult(value);
        }

        public Task<VersionedIntSetting> GetVersionedIntAsync(string key, CancellationToken cancellationToken = default)
        {
            LastKey = key;
            return Task.FromResult(new VersionedIntSetting(value, "v1"));
        }
    }
}
