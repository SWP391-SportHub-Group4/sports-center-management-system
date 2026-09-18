using System.IdentityModel.Tokens.Jwt;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using SportHub.Identity.Application.Auth;

namespace SportHub.Identity.Infrastructure.Authentication;

public sealed class GoogleAuthOptions
{
    public string ClientId { get; set; } = string.Empty;
}

public sealed class GoogleTokenVerifier(
    IConfigurationManager<OpenIdConnectConfiguration> configurationManager,
    IOptions<GoogleAuthOptions> options) : IGoogleTokenVerifier
{
    public async Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.Value.ClientId))
            throw new AuthException(503, "GOOGLE_AUTH_NOT_CONFIGURED", "Google sign-in is not configured.");
        if (string.IsNullOrWhiteSpace(idToken) || idToken.Length > 16384)
            throw new AuthException(401, "INVALID_GOOGLE_TOKEN", "The Google ID token is invalid.");

        try
        {
            var configuration = await configurationManager.GetConfigurationAsync(cancellationToken);
            var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
            var principal = handler.ValidateToken(idToken, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true, RequireSignedTokens = true,
                IssuerSigningKeys = configuration.SigningKeys,
                ValidateIssuer = true, ValidIssuers = ["https://accounts.google.com", "accounts.google.com"],
                ValidateAudience = true, ValidAudience = options.Value.ClientId,
                ValidateLifetime = true, RequireExpirationTime = true, ClockSkew = TimeSpan.FromSeconds(30),
                ValidAlgorithms = [SecurityAlgorithms.RsaSha256]
            }, out _);
            var subject = principal.FindFirst("sub")?.Value;
            if (string.IsNullOrWhiteSpace(subject)) throw new SecurityTokenException("Missing subject.");
            return new GoogleIdentity(subject, principal.FindFirst("email")?.Value ?? string.Empty,
                string.Equals(principal.FindFirst("email_verified")?.Value, "true", StringComparison.OrdinalIgnoreCase),
                principal.FindFirst("name")?.Value);
        }
        catch (SecurityTokenSignatureKeyNotFoundException)
        {
            configurationManager.RequestRefresh();
            throw new AuthException(401, "INVALID_GOOGLE_TOKEN", "The Google ID token could not be verified. Please try again.");
        }
        catch (Exception ex) when (ex is SecurityTokenException or ArgumentException)
        {
            throw new AuthException(401, "INVALID_GOOGLE_TOKEN", "The Google ID token is invalid or has expired.");
        }
        catch (Exception ex) when (ex is IOException or HttpRequestException or InvalidOperationException)
        {
            throw new AuthException(503, "GOOGLE_AUTH_UNAVAILABLE", "Google authentication is temporarily unavailable.");
        }
    }
}
