using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Application.Commands;

public sealed class CreateEnrollmentRequest
{
    [Required]
    public Guid SessionId { get; set; }

    /// <summary>
    /// Null = hệ thống tự chọn gói dùng được sớm hết hạn nhất. Chỉ định tường minh khi hội
    /// viên có nhiều gói cùng dùng được (BR-10 cho phép cộng dồn nếu Manager duyệt).
    /// </summary>
    public Guid? MemberPackageId { get; set; }

    /// <summary>Chỉ Lễ tân đăng ký hộ được; hội viên tự đăng ký thì bỏ trống (lấy từ JWT).</summary>
    public Guid? MemberId { get; set; }
}
