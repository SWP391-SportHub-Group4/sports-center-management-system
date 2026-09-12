using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SportHub.Repository.Enums.Identity;

namespace SportHub.Service.Utils.JWTService;

public static class JwtService
{
    public static string GenerateAccessToken(Guid userId, UserRole role, JwtOptions options)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, role.ToString()),
        };

        return GenerateToken(claims, options);
    }

    public static string GenerateToken(IEnumerable<Claim> claims, JwtOptions options)
    {
        var secretKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SecretKey));
        var signingCredentials = new SigningCredentials(secretKey, SecurityAlgorithms.HmacSha256);

        var tokenOptions = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(options.AccessTokenExpiryMinutes),
            signingCredentials: signingCredentials
        );

        return new JwtSecurityTokenHandler().WriteToken(tokenOptions);
    }
}
