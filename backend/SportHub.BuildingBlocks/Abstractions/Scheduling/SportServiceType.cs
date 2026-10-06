namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>
/// Dịch vụ một môn có thể cung cấp (CAT-01). Lưu int; chỉ được append, không đổi số cũ.
/// Membership và PT chỉ thuộc môn tham chiếu Gym (xem <see cref="SportCodes.Gym"/>).
/// </summary>
public enum SportServiceType
{
    MembershipAccess = 0,
    GroupCourse = 1,
    CourtRental = 2,
    PersonalTraining = 3
}

/// <summary>Mã môn tham chiếu do seed tạo. <c>sports.code</c> bất biến, nên đây là tham chiếu có kiểm soát, không phải dò tên.</summary>
public static class SportCodes
{
    public const string Gym = "gym";
}
