using System.ComponentModel.DataAnnotations;

namespace SportHub.Training.Application.Commands;

public sealed class RequestPtSessionChangeRequest
{
    /// <summary>"Cancel" hoặc "Reschedule" — parse bằng Enum.TryParse, không nhận enum thô từ client.</summary>
    [Required]
    public string RequestType { get; set; } = string.Empty;

    /// <summary>Bắt buộc khi RequestType = Reschedule.</summary>
    public DateTime? RequestedStartAtUtc { get; set; }

    [MaxLength(500)]
    public string? Reason { get; set; }

    /// <summary>Member xin ngoại lệ rule trễ hạn — Manager tự quyết định khi duyệt, không tự động áp dụng.</summary>
    public bool RequestsException { get; set; }
}
