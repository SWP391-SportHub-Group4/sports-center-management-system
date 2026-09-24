namespace SportHub.Identity.Application.Interfaces;

public interface IPasswordGenerator
{
    /// <summary>Sinh mật khẩu mạnh ngẫu nhiên, đủ chữ hoa/thường/số/ký tự đặc biệt.</summary>
    string GenerateStrong();
}
