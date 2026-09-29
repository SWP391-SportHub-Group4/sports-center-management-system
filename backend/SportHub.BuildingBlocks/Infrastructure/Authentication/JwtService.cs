using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace SportHub.BuildingBlocks.Infrastructure.Authentication;

public static class JwtService
{
    public const string SecurityStampClaimType = "sst";

    // Nhận role dạng string thay vì enum UserRole — BuildingBlocks không được phép
    // phụ thuộc module nghiệp vụ Identity (mục 3). Không có caller nào trước khi
    // đổi (rg "GenerateAccessToken" chỉ khớp định nghĩa), nên đổi signature an toàn,
    // không ảnh hưởng behavior gì đang chạy.
    public static string GenerateAccessToken(Guid userId, string role, JwtOptions options, Guid? securityStamp = null)
    {
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, role),
        };

        // sst = security stamp (BR-103/104): middleware so với DB nên đổi mật khẩu/vai trò vô hiệu token cũ ngay.
        if (securityStamp is { } stamp)
        {
            claims.Add(new Claim(SecurityStampClaimType, stamp.ToString()));
        }

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
