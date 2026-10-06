namespace SportHub.Identity.Domain.Enums;

// Mục đích OTP email. Giữ Register=0 để dòng OTP cũ tự mang đúng ý nghĩa.
public enum EmailOtpPurpose
{
    Register,
    ResetPassword
}
