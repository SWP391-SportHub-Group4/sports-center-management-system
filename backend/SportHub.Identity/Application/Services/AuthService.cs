using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Application.Commands;
using SportHub.Identity.Application.DTOs;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Identity.Application.Services;

public sealed class AuthService(
    IUserAccountRepository repository,
    IPasswordHasher passwordHasher,
    IOptions<JwtOptions> jwtOptions) : IAuthService
{
    public async Task<AuthResponse> RegisterAsync(
        RegisterRequest request,
        CancellationToken cancellationToken = default)
    {
        var email = request.Email.Trim();
        var fullName = request.FullName.Trim();
        var phone = string.IsNullOrWhiteSpace(request.Phone)
            ? null
            : request.Phone.Trim();

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

        await repository.AddAndSaveAsync(user, cancellationToken);

        var token = JwtService.GenerateAccessToken(
            user.UserId,
            role.RoleName.ToString(),
            jwtOptions.Value);

        return new AuthResponse
        {
            AccessToken = token,
            User = new UserSummaryDto
            {
                UserId = user.UserId,
                Email = email,
                FullName = fullName,
                Role = role.RoleName.ToString()
            }
        };
    }

    public async Task<AuthResponse> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken = default)
    {
        // Không ToLower: cột Email là citext nên == đã case-insensitive ở tầng DB (BR-49).
        // Password giữ nguyên, KHÔNG Trim — khoảng trắng trong password có ý nghĩa.
        var email = request.Email.Trim();

        var user = await repository.FindByEmailForLoginAsync(email, cancellationToken);

        // Gộp 2 nhánh "không có hash thật để verify" (email không tồn tại, BR-60 chưa đặt
        // password) vào cùng một chỗ, và chạy VerifyDummy trước khi throw: nếu thiếu, hai
        // nhánh này trả 401 gần như tức thì trong khi nhánh sai password tốn ~1 lần BCrypt,
        // đủ để dò xem email có tồn tại hay không chỉ bằng thời gian phản hồi.
        if (user is null || string.IsNullOrEmpty(user.Credential?.PasswordHash))
        {
            passwordHasher.VerifyDummy(request.Password);
            throw new InvalidCredentialsException();
        }

        if (!passwordHasher.Verify(request.Password, user.Credential.PasswordHash))
        {
            throw new InvalidCredentialsException();
        }

        // Check Status SAU khi password đã đúng: nếu check trước, kẻ tấn công dò được
        // "account này bị khoá" chỉ bằng email, không cần biết password.
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
            User = new UserSummaryDto
            {
                UserId = user.UserId,
                Email = user.Email,
                // ?. / ?? chỉ là lớp phòng thủ cho dữ liệu cũ thiếu UserProfile;
                // với Include đúng ở repository, trường hợp bình thường luôn có giá trị thật.
                FullName = user.Profile?.FullName ?? string.Empty,
                Role = user.Role!.RoleName.ToString()
            }
        };
    }
}
