using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Auth;

public sealed class GoogleAuthRequest
{
    [Required, MaxLength(16384)]
    public string IdToken { get; init; } = string.Empty;
}

public sealed record GoogleAuthResponse(Guid UserId, string AccessToken);
public sealed record GoogleIdentity(string Subject, string Email, bool EmailVerified, string? FullName);

public interface IGoogleTokenVerifier
{
    Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken cancellationToken);
}

public sealed class AuthException(int statusCode, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;
}
