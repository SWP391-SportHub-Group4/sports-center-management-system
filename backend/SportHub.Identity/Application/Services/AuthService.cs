using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Identity.Application.Services;

public sealed class AuthService(
    IUserAccountRepository repository,
    IPasswordHasher passwordHasher,
    IOptions<JwtOptions> jwtOptions,
    ISportHubDbContext db,
    IEmailSender emailSender,
    IClock clock) : IAuthService
{
    // BR-78 — ngưỡng khởi đầu, còn chờ mentor/team xác nhận (SSOT §7).
    public static readonly TimeSpan OtpLifetime = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan OtpResendCooldown = TimeSpan.FromSeconds(60);
    public const int OtpMaxAttempts = 5;

    /// <summary>
    /// BR-78 bước 1 — gửi mã 6 số tới email. Chưa tạo tài khoản nào ở bước này; chỉ ghi/ghi đè
    /// đúng 1 dòng EmailOtp cho email đó.
    /// </summary>
    public async Task RequestRegisterOtpAsync(
        RequestRegisterOtpRequest request,
        CancellationToken cancellationToken = default)
    {
        var email = request.Email.Trim();

        // Email đã có tài khoản thì Register chắc chắn 409 — không gửi email vô ích. Không làm lộ
        // thêm gì: chính POST /api/auth/register cũng đã trả email_already_exists.
        if (await repository.EmailExistsAsync(email, cancellationToken))
        {
            throw new EmailAlreadyExistsException();
        }

        var now = clock.UtcNow;
        var otp = await db.Set<EmailOtp>().SingleOrDefaultAsync(o => o.Email == email, cancellationToken);

        if (otp is not null && now - otp.CreatedAt < OtpResendCooldown)
        {
            throw OtpResendTooSoon();
        }

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);

        if (otp is null)
        {
            otp = new EmailOtp { EmailOtpId = Guid.NewGuid(), Email = email };
            db.Set<EmailOtp>().Add(otp);
        }

        // Mã mới thay hẳn mã cũ: reset cả số lần sai lẫn trạng thái đã dùng.
        otp.CodeHash = HashOtp(code);
        otp.ExpiresAt = now + OtpLifetime;
        otp.Attempts = 0;
        otp.ConsumedAt = null;
        otp.CreatedAt = now;

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Hai request cùng email chạy song song cùng INSERT — unique index chặn request sau.
            throw OtpResendTooSoon();
        }

        try
        {
            await emailSender.SendAsync(
                email,
                "SportHub - Mã xác thực đăng ký",
                $"<p>Mã xác thực đăng ký tài khoản SportHub của bạn là:</p>"
                + $"<p style=\"font-size:24px;font-weight:bold;letter-spacing:4px\">{code}</p>"
                + $"<p>Mã có hiệu lực trong {OtpLifetime.TotalMinutes:0} phút. "
                + "Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.</p>",
                cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Gửi hỏng thì bỏ mã vừa lưu — nếu không, cooldown sẽ chặn người dùng gửi lại trong
            // khi họ chưa hề nhận được mã nào.
            db.Set<EmailOtp>().Remove(otp);
            await db.SaveChangesAsync(CancellationToken.None);

            throw new AppException(
                StatusCodes.Status503ServiceUnavailable,
                "otp_email_send_failed",
                "Không gửi được email chứa mã xác thực. Vui lòng thử lại sau.");
        }
    }

    public async Task<AuthResponse> RegisterAsync(
        RegisterRequest request,
        CancellationToken cancellationToken = default)
    {
        var email = request.Email.Trim();
        var fullName = request.FullName.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone)
            ? null
            : request.Phone.Trim();

        // BR-78 — xác thực OTP TRƯỚC mọi check khác. Mã chỉ bị đánh dấu đã dùng khi tài khoản
        // thực sự được tạo (cùng SaveChanges ở AddAndSaveAsync bên dưới).
        var otp = await VerifyRegisterOtpAsync(email, request.OtpCode, cancellationToken);

        if (await repository.EmailExistsAsync(email, cancellationToken))
        {
            throw new EmailAlreadyExistsException();
        }

        if (phone is not null && await repository.PhoneExistsAsync(phone, cancellationToken))
        {
            throw new PhoneAlreadyExistsException();
        }

        var role = await repository.GetRoleAsync(UserRole.Member, cancellationToken);

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = email,
            RoleId = role.RoleId,
            Status = UserStatus.Active,
            CreatedAt = DateTime.UtcNow,

            Credential = new UserCredential
            {
                PasswordHash = passwordHasher.Hash(request.Password)
            },

            Profile = new UserProfile
            {
                FullName = fullName,
                Phone = phone
            }
        };

        // Repository và db dùng chung DbContext scoped nên lần SaveChanges này lưu cả tài khoản
        // mới lẫn ConsumedAt — không có trạng thái "mã đã dùng mà tài khoản chưa tạo".
        otp.ConsumedAt = clock.UtcNow;

        await repository.AddAndSaveAsync(user, cancellationToken);

        var token = JwtService.GenerateAccessToken(
            user.UserId,
            role.RoleName.ToString(),
            jwtOptions.Value);

        return new AuthResponse
        {
            AccessToken = token,
            User = new UserSummaryResponse
            {
                UserId = user.UserId,
                Email = email,
                FullName = fullName,
                Role = role.RoleName.ToString()
            },
            IsNewAccount = true,
            SuggestedPassword = null
        };
    }

    public async Task<AuthResponse> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default)
    {
        var email = request.Email.Trim();

        var user = await repository.FindByEmailForLoginAsync(email, cancellationToken);
        if (user is null || string.IsNullOrEmpty(user.Credential?.PasswordHash))
        {
            passwordHasher.VerifyDummy(request.Password);
            throw new InvalidCredentialsException();
        }

        if (!passwordHasher.Verify(request.Password, user.Credential.PasswordHash))
        {
            throw new InvalidCredentialsException();
        }
        
        if (user.Status != UserStatus.Active)
        {
            throw new AccountBlockedException(user.Status);
        }

        var token = JwtService.GenerateAccessToken(
            user.UserId,
            user.Role!.RoleName.ToString(),
            jwtOptions.Value);

        return new AuthResponse
        {
            AccessToken = token,
            User = new UserSummaryResponse
            {
                UserId = user.UserId,
                Email = user.Email,
                FullName = user.Profile?.FullName ?? string.Empty,
                Role = user.Role!.RoleName.ToString()
            },
            IsNewAccount = false,
            SuggestedPassword = null
        };
    }

    /// <summary>
    /// Thứ tự kiểm tra cố định: không có mã → đã dùng → hết hạn → hết lượt → sai mã. "Đã dùng"
    /// đứng trước "hết hạn" để mã vừa dùng xong vẫn báo đúng lý do dù đã quá 10 phút.
    /// </summary>
    private async Task<EmailOtp> VerifyRegisterOtpAsync(
        string email,
        string code,
        CancellationToken cancellationToken)
    {
        var otp = await db.Set<EmailOtp>().SingleOrDefaultAsync(o => o.Email == email, cancellationToken)
            ?? throw new BadRequestException(
                "otp_not_found", "Chưa có mã xác thực cho email này. Hãy yêu cầu gửi mã trước.");

        if (otp.ConsumedAt is not null)
        {
            throw new BadRequestException("otp_already_used", "Mã xác thực đã được sử dụng. Hãy yêu cầu mã mới.");
        }

        if (clock.UtcNow >= otp.ExpiresAt)
        {
            throw new BadRequestException("otp_expired", "Mã xác thực đã hết hạn. Hãy yêu cầu mã mới.");
        }

        if (otp.Attempts >= OtpMaxAttempts)
        {
            throw new BadRequestException(
                "otp_attempts_exceeded", "Đã nhập sai quá số lần cho phép. Hãy yêu cầu mã mới.");
        }

        var expected = Encoding.ASCII.GetBytes(otp.CodeHash);
        var actual = Encoding.ASCII.GetBytes(HashOtp(code));

        if (!CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            otp.Attempts++;
            await db.SaveChangesAsync(cancellationToken);

            throw new BadRequestException("otp_invalid", "Mã xác thực không đúng.");
        }

        return otp;
    }

    /// <summary>
    /// SHA-256, không BCrypt: mã 6 số chỉ có 10^6 khả năng nên hash chậm cũng không cứu được
    /// nếu lộ DB — lớp chặn thật là hạn 10 phút + tối đa 5 lần thử + rate limit.
    /// </summary>
    private static string HashOtp(string code)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code)));

    private static AppException OtpResendTooSoon()
        => new(
            StatusCodes.Status429TooManyRequests,
            "otp_resend_too_soon",
            $"Vui lòng đợi {OtpResendCooldown.TotalSeconds:0} giây trước khi yêu cầu mã mới.");
}
