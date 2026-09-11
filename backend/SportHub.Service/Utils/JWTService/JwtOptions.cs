using System.ComponentModel.DataAnnotations;

namespace SportHub.Service.Utils.JWTService;

public class JwtOptions
{
    [Required]
    public string Issuer { get; set; } = string.Empty;

    [Required]
    public string Audience { get; set; } = string.Empty;

    [Required, MinLength(32)]
    public string SecretKey { get; set; } = string.Empty;

    [Range(1, 1440)]
    public int AccessTokenExpiryMinutes { get; set; } = 60;
}
