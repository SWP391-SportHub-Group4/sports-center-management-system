using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Application.Services;

public sealed record MemberCheckInCode(string Code, DateTime ExpiresAtUtc);

/// <summary>
/// Mã QR check-in do server cấp: <c>SPORTHUB-CODE:{memberId}.{hết hạn unix}.{chữ ký HMAC}</c>.
/// Hiệu lực đến hết ngày giờ Việt Nam; client không tự dựng được mã. Mã chỉ định danh Member —
/// quyền vào Gym (gói còn hiệu lực / vé ngày) vẫn do check-in kiểm tra ở server (BR-64).
/// </summary>
public sealed class MemberCheckInCodeService(IOptions<JwtOptions> jwt, IClock clock)
{
    public const string Prefix = "SPORTHUB-CODE:";
    private const string Purpose = "sporthub:member-checkin-code:v1";

    public MemberCheckInCode Issue(Guid memberId)
    {
        var today = VietnamTime.TodayLocal(clock);
        var expiresAt = VietnamTime.EndOfDayExclusiveUtc(today);
        var body = $"{memberId:N}.{new DateTimeOffset(expiresAt).ToUnixTimeSeconds()}";
        return new MemberCheckInCode($"{Prefix}{body}.{Sign(body)}", expiresAt);
    }

    /// <summary>Trả về memberId nếu mã đúng chữ ký và còn hạn; ngược lại ném lỗi 400/409.</summary>
    public Guid Resolve(string? code)
    {
        var value = code?.Trim() ?? string.Empty;
        var parts = value.StartsWith(Prefix, StringComparison.Ordinal)
            ? value[Prefix.Length..].Split('.')
            : [];
        if (parts.Length != 3
            || !Guid.TryParseExact(parts[0], "N", out var memberId)
            || !long.TryParse(parts[1], out var expiresUnix))
            throw new BadRequestException("checkin_code_invalid", "Check-in code is not valid.");

        var expected = Encoding.ASCII.GetBytes(Sign($"{parts[0]}.{parts[1]}"));
        if (!CryptographicOperations.FixedTimeEquals(expected, Encoding.ASCII.GetBytes(parts[2])))
            throw new BadRequestException("checkin_code_invalid", "Check-in code is not valid.");

        if (DateTimeOffset.FromUnixTimeSeconds(expiresUnix).UtcDateTime <= clock.UtcNow)
            throw new ConflictException("checkin_code_expired", "Check-in code has expired; ask the member to open today's code.");

        return memberId;
    }

    private string Sign(string body)
    {
        var key = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(jwt.Value.SecretKey), Encoding.UTF8.GetBytes(Purpose));
        return Convert.ToBase64String(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(body)))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
