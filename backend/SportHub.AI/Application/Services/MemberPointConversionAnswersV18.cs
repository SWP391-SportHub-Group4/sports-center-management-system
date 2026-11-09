using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Member ONLY: verified wallet point conversion, bypassing potentially inaccurate LLM answers.
/// The rate mirrors Payment/Wallet/Application/PointWalletService.VndPerPoint and is
/// checked against that source by the installer. No dependency on Payment write service.
/// This is an accounting equivalence, NOT a promise of cash redemption or withdrawal.
/// </summary>
internal static class MemberPointConversionAnswersV18
{
    private const int VndPerPoint = 1000;
    private static readonly CultureInfo Vn = CultureInfo.GetCultureInfo("vi-VN");
    private static readonly Regex PointsAmount = new(@"(?<!\d)(\d[\d.,]*)\s*(?:diem|points?)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex MoneyAmount = new(@"(?<!\d)(\d[\d.,]*)\s*(?:vnd|dong|d\b|₫|đ\b)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    internal static bool IsConversionQuestion(string question)
    {
        var q = Normalize(question);
        if (!Has(q, "diem", "point", "wallet", "vi diem")) return false;
        if (Has(q, "diem danh", "cham diem", "diem tap", "diem so")) return false;
        return Has(q, "quy doi", "ty le", "ti le", "bao nhieu tien", "bao nhieu dong", "gia tri", "vnd", "1 diem", "tien sang diem", "diem sang tien", "exchange rate", "conversion", "worth", "equivalent", "convert") ||
            (Has(q, "bao nhieu diem", "how many points") && Has(q, "tien", "vnd", "dong"));
    }

    internal static async Task<AiChatResponse?> TryAnswerAsync(
        ISportHubDbContext db, IClock clock, Guid authenticatedUserId, string question, CancellationToken ct)
    {
        if (!IsConversionQuestion(question)) return null;
        var started = Stopwatch.StartNew();
        // Reuse the v14 Member-only role check and the v12 read-only wallet projection.
        var evidence = await MemberReadOnlyGateway.LoadEvidenceAsync(
            db, authenticatedUserId, MemberEvidenceDomain.Points, clock.UtcNow, ct);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(evidence));
        int available = 0, held = 0;
        if (json.RootElement.TryGetProperty("wallet", out var wallet) && wallet.ValueKind == JsonValueKind.Object)
        {
            available = wallet.GetProperty("AvailablePoints").GetInt32();
            held = wallet.GetProperty("HeldPoints").GetInt32();
        }

        var q = Normalize(question);
        string answer;
        var amountPoints = PointsAmount.Match(q);
        var amountMoney = MoneyAmount.Match(q);
        if (amountMoney.Success && !amountPoints.Success && TryParseNonnegative(amountMoney.Groups[1].Value, out var cash))
        {
            var points = Math.Floor(cash / VndPerPoint);
            var remainder = cash % VndPerPoint;
            answer = $"Theo tỷ lệ ví SportHub, {Fmt(cash)} VND tương đương {Fmt(points)} điểm nguyên" +
                (remainder != 0 ? $" (còn lẻ {Fmt(remainder)} VND, không tạo điểm lẻ)." : ".") +
                " Đây là tỷ lệ quy đổi dùng trong hệ thống, không có nghĩa điểm được rút thành tiền mặt.";
        }
        else if (amountPoints.Success && TryParseNonnegative(amountPoints.Groups[1].Value, out var pointsAmount))
        {
            answer = $"{Fmt(pointsAmount)} điểm tương đương {Fmt(pointsAmount * VndPerPoint)} VND theo tỷ lệ 1 điểm = {Fmt(VndPerPoint)} VND.";
        }
        else
        {
            answer = $"Tỷ lệ hiện tại: 1 điểm = {Fmt(VndPerPoint)} VND. " +
                $"Ví của bạn có {Fmt(available)} điểm khả dụng (tương đương {Fmt((decimal)available * VndPerPoint)} VND) " +
                $"và {Fmt(held)} điểm đang giữ (tương đương {Fmt((decimal)held * VndPerPoint)} VND).";
        }
        answer += " Điểm chỉ có thể sử dụng theo chức năng và điều kiện thanh toán/hoàn điểm của SportHub.";
        started.Stop();
        return new AiChatResponse(Guid.Empty, "member-points-v18", question, answer,
            "member-verified", "backend-read-only", "member-point-conversion-v18",
            (int)Math.Min(int.MaxValue, started.ElapsedMilliseconds), clock.UtcNow);
    }

    private static bool TryParseNonnegative(string raw, out decimal result)
    {
        // The SportHub UI formats thousands with dots/commas. Point amounts are integers.
        var digits = raw.Replace(".", "").Replace(",", "");
        return decimal.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out result) && result >= 0 && result <= 1_000_000_000m;
    }
    private static string Fmt(decimal value) => value.ToString("N0", Vn);
    private static bool Has(string q, params string[] terms) => terms.Any(s => q.Contains(s, StringComparison.Ordinal));
    private static string Normalize(string raw)
    {
        var b = new StringBuilder();
        foreach (var c in (raw ?? "").Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                b.Append(c is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(c));
        return b.ToString().Normalize(NormalizationForm.FormC);
    }
}
