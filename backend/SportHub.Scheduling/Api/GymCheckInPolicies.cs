namespace SportHub.Scheduling.Api;

// Tên policy của luồng Gym check-in.
//
// Hằng số đặt ở module thay vì cạnh AuthorizationPolicyExtensions: controller nằm trong
// SportHub.Scheduling, mà Scheduling không được tham chiếu ngược SportHub.API
// (composition root). SportHub.API tham chiếu Scheduling nên vẫn đăng ký policy tập
// trung ở một chỗ như cũ — chỉ tên là do module khai báo.
//
// Không tái dụng AttendanceCheckInPolicy: policy đó còn cho phép Coach, trong khi Gym
// check-in là việc của riêng Lễ tân (BR-64, Design v2 §5 ma trận RBAC).
public static class GymCheckInPolicies
{
    public const string Create = nameof(GymCheckInPolicies) + "." + nameof(Create);

    // Tra cứu lịch sử của MỘT Member bất kỳ: Lễ tân và Quản lý. Manager chỉ đọc —
    // không có mặt ở policy Create. SystemAdministrator không được cấp quyền nghiệp vụ này.
    public const string ReadAny = nameof(GymCheckInPolicies) + "." + nameof(ReadAny);

    // Member đọc lịch sử của chính mình; memberId lấy từ JWT, không nhận từ route.
    public const string ReadSelf = nameof(GymCheckInPolicies) + "." + nameof(ReadSelf);
}
