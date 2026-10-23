namespace SportHub.Identity.Domain.Entities;

/// <summary>Ảnh member đính kèm khi gửi yêu cầu hỗ trợ (tùy chọn, tối đa vài ảnh).</summary>
public sealed class MemberSupportAttachment
{
    public Guid AttachmentId { get; set; }

    public Guid RequestId { get; set; }

    public string FileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public byte[] Content { get; set; } = [];

    public DateTime CreatedAt { get; set; }

    /// <summary>EVIDENCE: ảnh người gửi yêu cầu đính kèm; PAYOUT_PROOF: chứng từ chuyển khoản Manager tải lên khi hoàn tiền.</summary>
    public string Kind { get; set; } = SupportAttachmentKinds.Evidence;

    public Guid? UploadedByUserId { get; set; }
}

public static class SupportAttachmentKinds
{
    public const string Evidence = "EVIDENCE";
    public const string PayoutProof = "PAYOUT_PROOF";
}
