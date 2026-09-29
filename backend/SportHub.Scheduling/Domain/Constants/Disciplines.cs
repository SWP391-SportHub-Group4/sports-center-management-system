namespace SportHub.Scheduling.Domain.Constants;

// Bộ môn hợp lệ của Class — chốt 18/09/2026 (SSOT §1.1; entity-field-purpose.md, bảng CLASSES).
//
// Giữ Discipline dạng string thay vì đổi sang enum: SSOT mô tả field này là string và
// đổi kiểu sẽ kéo theo cả contract API lẫn kiểu cột DB. Gom ba giá trị chính thức vào
// một chỗ để validator (ClassRules), DB CHECK constraint (ClassConfiguration) và
// service layer dùng chung đúng một nguồn, không rải literal khắp nơi.
//
// Gym/Fitness KHÔNG có mặt ở đây: Gym ra vào tự do, không đặt lịch qua Class —
// đi qua entity GymCheckIn (BR-64). Boxing và các bộ môn khác nằm ngoài scope (SSOT §1.3).
public static class Disciplines
{
    // Giữ hằng số này (không xóa) vì CK_classes_personal_training_capacity và một số test cũ
    // vẫn tham chiếu — nhưng KHÔNG còn nằm trong `All` nên không tạo được Class mới với giá
    // trị này (đổi 29/09/2026, BE-4): PT dùng PtEntitlement/PtSession riêng, không dùng Class.
    public const string PersonalTraining = nameof(PersonalTraining);

    public const string Yoga = nameof(Yoga);

    public const string GroupX = nameof(GroupX);

    // Personal Training = 1 Member ↔ 1 Coach, nên sức chứa luôn đúng bằng 1 (SSOT §1.1).
    public const int PersonalTrainingCapacity = 1;

    // Đổi 29/09/2026 (BE-4): loại PersonalTraining khỏi danh sách hợp lệ cho Class — xem
    // docs/backend-be4-pt-training-implementation-plan.md §2. Yoga/Group X tiếp tục dùng
    // Class/ClassSession/Enrollment như cũ.
    public static readonly IReadOnlyList<string> All = [Yoga, GroupX];

    public static bool IsValid(string? discipline)
        => discipline is not null && All.Contains(discipline);
}
