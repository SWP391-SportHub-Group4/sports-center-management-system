using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Rules;

namespace SportHub.Identity.Application.Services;

/// <summary>Áp <see cref="PasswordPolicy"/> ở tầng service; vi phạm trả 400 với mã lỗi ổn định (password_*).</summary>
public static class PasswordPolicyGuard
{
    public static void Enforce(string? password, string? email)
    {
        var violation = PasswordPolicy.Validate(password, email);
        if (violation is not null)
        {
            throw new BadRequestException(violation, PasswordPolicy.Message(violation));
        }
    }

    public static void EnforceConfirmation(string password, string confirmPassword)
    {
        if (password != confirmPassword)
        {
            throw new BadRequestException(
                "password_confirmation_mismatch",
                "Mật khẩu và xác nhận mật khẩu không khớp.");
        }
    }
}
