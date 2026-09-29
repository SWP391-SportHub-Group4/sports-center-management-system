namespace SportHub.Identity.Domain.Entities;

/// <summary>Chuyên môn của Coach / môn giảng dạy khai báo của ExternalCoach (BR-96, BR-105). PK ghép (UserId, SportId).</summary>
public class UserSportSpecialty
{
    public Guid UserId { get; set; }

    public UserAccount? UserAccount { get; set; }

    /// <summary>FK sang bảng sports của Scheduling — chỉ scalar, quan hệ cấu hình ở CrossModuleRelationships (host).</summary>
    public int SportId { get; set; }
}
