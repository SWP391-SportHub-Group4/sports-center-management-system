using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Domain.Constants;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassConfiguration : IEntityTypeConfiguration<Class>
{
    public void Configure(EntityTypeBuilder<Class> builder)
    {
        builder.HasKey(e => e.ClassId);

        // Lưới an toàn ở tầng DB cho hai ràng buộc bộ môn chốt 18/09/2026 (SSOT §1.1);
        // validation "đẹp" cho client nằm ở Domain/Rules/ClassRules.cs, không thay thế nhau.
        //
        // 1) Discipline chỉ nhận ba giá trị chính thức — chặn cả 'Gym' (ra vào tự do,
        //    đi qua GymCheckIn) lẫn 'Boxing' (ngoài scope, SSOT §1.3).
        // 2) Personal Training luôn Capacity = 1. Ràng buộc tương ứng ở ClassSession đọc
        //    Discipline của Class cha nên là ràng buộc xuyên bảng — thuộc service layer,
        //    không đặt bằng CHECK ở đây (Design v2 §3).
        builder.ToTable(t =>
        {
            t.HasCheckConstraint(
                "CK_classes_discipline_allowed",
                $"discipline IN ({string.Join(", ", Disciplines.All.Select(d => $"'{d}'"))})");

            t.HasCheckConstraint(
                "CK_classes_personal_training_capacity",
                $"discipline <> '{Disciplines.PersonalTraining}' "
                + $"OR capacity = {Disciplines.PersonalTrainingCapacity}");
        });

        builder.HasOne(e => e.DefaultRoom)
            .WithMany(r => r.Classes)
            .HasForeignKey(e => e.DefaultRoomId)
            .OnDelete(DeleteBehavior.Restrict);

        // DefaultCoachId giữ nullable kể cả với Personal Training: HLV phụ trách THẬT
        // nằm ở ClassSession.CoachId (đã not-null), còn ở Class chỉ là giá trị mặc định
        // để sinh session. Siết non-null ở đây sẽ chặn luồng tạo lớp trước-gán-coach-sau
        // mà SSOT không yêu cầu.
        builder.HasOne(e => e.DefaultCoach)
            .WithMany()
            .HasForeignKey(e => e.DefaultCoachId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
