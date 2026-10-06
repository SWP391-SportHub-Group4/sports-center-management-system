namespace SportHub.BuildingBlocks.Api;

/// <summary>
/// Tên role đúng như JWT phát ra (PascalCase, khớp tên member enum UserRole — SSOT §5.6).
///
/// Dùng cho các nhánh rẽ TRONG một endpoint mà nhiều vai trò cùng gọi được (vd Manager thấy
/// thêm cột, Member chỉ thấy dữ liệu của mình). Việc chặn ai được gọi endpoint vẫn là của
/// policy — hằng số ở đây không thay thế [Authorize].
///
/// Mirror của enum UserRole vì BuildingBlocks không phụ thuộc module Identity;
/// UserRoleNameMirrorTests giữ hai bên khớp nhau.
/// </summary>
public static class SportHubRoleNames
{
    public const string SystemAdministrator = nameof(SystemAdministrator);
    public const string CenterManager = nameof(CenterManager);
    public const string Coach = nameof(Coach);
    public const string Member = nameof(Member);
    public const string Receptionist = nameof(Receptionist);
}
