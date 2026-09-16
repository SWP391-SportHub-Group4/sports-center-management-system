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
}
