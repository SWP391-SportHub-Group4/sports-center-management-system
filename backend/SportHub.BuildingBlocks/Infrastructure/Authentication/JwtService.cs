using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace SportHub.BuildingBlocks.Infrastructure.Authentication;

public static class JwtService
{
    // Nhận role dạng string thay vì enum UserRole — BuildingBlocks không được phép
    // phụ thuộc module nghiệp vụ Identity (mục 3). Không có caller nào trước khi
    // đổi (rg "GenerateAccessToken" chỉ khớp định nghĩa), nên đổi signature an toàn,
    // không ảnh hưởng behavior gì đang chạy.
    public static string GenerateAccessToken(Guid userId, string role, JwtOptions options)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim("role", role),
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
