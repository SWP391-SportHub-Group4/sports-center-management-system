using SportHub.Scheduling.Domain.Constants;
using SportHub.Scheduling.Domain.Exceptions;

namespace SportHub.Scheduling.Domain.Rules;

// Validator dùng chung cho mọi đường ghi nghiệp vụ của Class/ClassSession.
//
// Song song với DB CHECK constraint ở ClassConfiguration: CHECK là lưới an toàn cuối
// (không thay thế validation ở tầng trên), còn ở đây sinh thông báo lỗi đọc được cho
// client thay vì 23514 của Postgres.
//
// Ràng buộc "PT capacity = 1" ở mức session phải đọc Discipline của Class cha, tức là
// xuyên bảng — không đặt được bằng CHECK thông thường (Design v2 §3), nên service tạo/
// sửa/sinh ClassSession bắt buộc gọi ValidateSessionCapacity trong cùng transaction.
public static class ClassRules
{
    public static void ValidateClass(string? discipline, int capacity)
    {
        if (!Disciplines.IsValid(discipline))
        {
            throw new InvalidDisciplineException(discipline);
        }

        ValidateSessionCapacity(discipline!, capacity);
    }

    public static void ValidateSessionCapacity(string discipline, int capacity)
    {
        if (discipline == Disciplines.PersonalTraining && capacity != Disciplines.PersonalTrainingCapacity)
        {
            throw new InvalidClassCapacityException(discipline, capacity);
        }
    }
}
