using System.Globalization;
using System.Text;

namespace SportHub.Identity.Domain.Rules;

/// <summary>
/// Chính sách mật khẩu (BR-60/103/104): 8–64 ký tự, đủ 4 nhóm (thường, HOA, chữ số, ký tự đặc biệt),
/// không chứa phần local-part của email (không phân biệt hoa/thường).
/// Độ dài đếm theo ký tự Unicode (rune), không theo byte — hash không còn giới hạn 72 byte.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 64;

    public const string TooShort = "password_too_short";
    public const string TooLong = "password_too_long";
    public const string MissingGroups = "password_missing_character_groups";
    public const string ContainsEmailLocalPart = "password_contains_email";

    /// <summary>Trả về mã lỗi đầu tiên vi phạm, hoặc null nếu hợp lệ.</summary>
    public static string? Validate(string? password, string? email)
    {
        password ??= string.Empty;

        var length = password.EnumerateRunes().Count();
        if (length < MinLength) return TooShort;
        if (length > MaxLength) return TooLong;

        var lower = false;
        var upper = false;
        var digit = false;
        var special = false;

        foreach (var rune in password.EnumerateRunes())
        {
            var category = Rune.GetUnicodeCategory(rune);
            if (category == UnicodeCategory.LowercaseLetter) lower = true;
            else if (category == UnicodeCategory.UppercaseLetter) upper = true;
            else if (category == UnicodeCategory.DecimalDigitNumber) digit = true;
            else if (!Rune.IsLetterOrDigit(rune)) special = true;
            else if (Rune.IsLetter(rune)) lower = true; // chữ không phân hoa/thường (CJK...) tính là nhóm chữ thường
        }

        if (!(lower && upper && digit && special)) return MissingGroups;

        var localPart = LocalPart(email);
        if (localPart.Length > 0
            && password.Contains(localPart, StringComparison.OrdinalIgnoreCase))
        {
            return ContainsEmailLocalPart;
        }

        return null;
    }

    public static string Message(string code) => code switch
    {
        TooShort => $"Mật khẩu phải có ít nhất {MinLength} ký tự.",
        TooLong => $"Mật khẩu không được dài quá {MaxLength} ký tự.",
        MissingGroups => "Mật khẩu phải có chữ thường, chữ hoa, chữ số và ký tự đặc biệt.",
        ContainsEmailLocalPart => "Mật khẩu không được chứa phần tên trước @ của email.",
        _ => "Mật khẩu không hợp lệ."
    };

    private static string LocalPart(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return string.Empty;
        var at = email.IndexOf('@');
        return (at > 0 ? email[..at] : email).Trim();
    }
}
