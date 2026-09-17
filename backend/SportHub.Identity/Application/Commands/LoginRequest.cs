using System.ComponentModel.DataAnnotations;

namespace SportHub.Identity.Application.Commands;

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    // Không đặt [MinLength(8)] như Register: account cũ vẫn phải đăng nhập được dù
    // rule độ dài đổi sau này. Giới hạn 72 byte là ràng buộc kỹ thuật của BCrypt.
    [Required, MaxPasswordBytes(72)]
    public string Password { get; set; } = string.Empty;
}
