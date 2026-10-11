namespace SportHub.Identity.Domain.Entities;

/// <summary>
/// Coach đủ điều kiện dạy một dịch vụ cụ thể của môn (CAT-01), ví dụ dịch vụ PT của Gym. Tách khỏi chuyên môn theo môn:
/// Coach chỉ có chuyên môn Gym không tự nhận quyền PT. PK ghép (UserId, OfferingId).
/// </summary>
public class CoachServiceQualification
{
    public Guid UserId { get; set; }

    public UserAccount? UserAccount { get; set; }

    /// <summary>FK sang sport_service_offerings của Scheduling: chỉ scalar, quan hệ cấu hình ở CrossModuleRelationships (host).</summary>
    public int OfferingId { get; set; }
}
