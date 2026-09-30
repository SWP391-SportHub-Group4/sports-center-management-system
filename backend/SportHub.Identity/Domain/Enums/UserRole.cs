namespace SportHub.Identity.Domain.Enums;

public enum UserRole
{
    CenterManager,
    Coach,
    Member,
    Receptionist,
    SystemAdministrator,
    // Append cuối để không đổi số role cũ. Dòng seed Role (RoleId=6) thêm cùng migration ở P1.02.
    ExternalCoach
}
