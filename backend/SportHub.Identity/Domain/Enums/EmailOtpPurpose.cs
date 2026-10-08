namespace SportHub.Identity.Domain.Enums;

// Mục đích OTP email. Giữ Register=0 để dòng OTP cũ tự mang đúng ý nghĩa.
public enum EmailOtpPurpose
{
    Register,
    ResetPassword,
    /// <summary>Mã 6 số xác nhận chủ email trước khi tài khoản Google-only đặt mật khẩu lần đầu trong Cài đặt tài khoản.</summary>
    SetPassword
}
