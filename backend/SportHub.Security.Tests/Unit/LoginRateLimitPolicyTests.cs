using System.Threading.RateLimiting;
using SportHub.API.RateLimiting;

namespace SportHub.Security.Tests.Unit;

public class LoginRateLimitPolicyTests
{
    [Fact]
    public void Production_configuration_is_ten_per_minute()
    {
        // AuthController gan [EnableRateLimiting("auth-login")] bang literal vi module
        // Identity khong duoc phu thuoc nguoc len SportHub.API. Test nay chot hai ben khop nhau.
        Assert.Equal("auth-login", LoginRateLimitPolicy.PolicyName);
        Assert.Equal(10, LoginRateLimitPolicy.PermitLimit);
        Assert.Equal(TimeSpan.FromMinutes(1), LoginRateLimitPolicy.Window);
    }

    [Fact]
    public async Task Window_replenishes_after_it_elapses()
    {
        // Dung limiter instance voi window ngan de khong phai cho 1 phut trong CI.
        // Cau hinh production 10/1 phut duoc chot rieng o test ben tren.
        using var limiter = new FixedWindowRateLimiter(new FixedWindowRateLimiterOptions
        {
            PermitLimit = 2,
            Window = TimeSpan.FromMilliseconds(300),
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            AutoReplenishment = true
        });

        Assert.True(limiter.AttemptAcquire().IsAcquired);
        Assert.True(limiter.AttemptAcquire().IsAcquired);
        Assert.False(limiter.AttemptAcquire().IsAcquired);

        await Task.Delay(TimeSpan.FromMilliseconds(600));

        Assert.True(limiter.AttemptAcquire().IsAcquired);
    }

    [Fact]
    public void Rejected_lease_exposes_retry_after_metadata()
    {
        // Chot gia dinh cua OnRejected: Retry-After chi duoc set khi lease that su co
        // metadata. Neu behavior nay doi, header se bien mat va test nay bao truoc.
        using var limiter = new FixedWindowRateLimiter(new FixedWindowRateLimiterOptions
        {
            PermitLimit = 1,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            AutoReplenishment = true
        });

        using var first = limiter.AttemptAcquire();
        Assert.True(first.IsAcquired);

        using var rejected = limiter.AttemptAcquire();
        Assert.False(rejected.IsAcquired);
        Assert.True(rejected.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter));
        Assert.True(retryAfter > TimeSpan.Zero);
    }
}
