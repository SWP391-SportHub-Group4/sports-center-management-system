using SportHub.Identity.Domain.Entities;

namespace SportHub.Training.Domain.Entities;

/// <summary>
/// Mới 29/09/2026 (BE-4). Member xin Cancel/Reschedule một PtSession; Manager duyệt/từ chối.
/// Mỗi session tối đa 1 request Pending; TimingClassification tính tại RequestedAt (đối chiếu
/// deadline 24 giờ), không tính tại lúc Manager duyệt.
/// </summary>
public class PtSessionChangeRequest
{
    public Guid RequestId { get; set; } // PK

    public Guid SessionId { get; set; } // FK -> PtSession

    public PtSession? Session { get; set; }

    public Guid RequestedByUserId { get; set; } // Member gửi yêu cầu

    public UserAccount? RequestedByUser { get; set; }

    public PtSessionChangeRequestType RequestType { get; set; }

    public DateTime? RequestedStartAtUtc { get; set; } // chỉ khi RequestType = Reschedule

    public DateTime RequestedAt { get; set; }

    public string? Reason { get; set; }

    public PtSessionTimingClassification TimingClassification { get; set; }

    public bool RequestsException { get; set; } // Member xin ngoại lệ rule trễ hạn

    public PtSessionChangeRequestStatus Status { get; set; }

    public Guid? ReviewedByUserId { get; set; }

    public UserAccount? ReviewedByUser { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string? ReviewNote { get; set; }
}
