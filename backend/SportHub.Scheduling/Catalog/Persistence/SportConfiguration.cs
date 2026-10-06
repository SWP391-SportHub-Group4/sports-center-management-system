using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class SportConfiguration : IEntityTypeConfiguration<Sport>
{
    public void Configure(EntityTypeBuilder<Sport> builder)
    {
        builder.ToTable("sports");
        builder.HasKey(e => e.SportId);
        builder.Property(e => e.Code).HasColumnType("citext").IsRequired();
        builder.HasIndex(e => e.Code).IsUnique();
        builder.Property(e => e.Name).HasColumnType("citext").IsRequired();
        builder.HasIndex(e => e.Name).IsUnique();

        // Dữ liệu tham chiếu khởi tạo (Design v3 §1.1, CAT-01). Personal Training không còn là môn: PT là dịch vụ của Gym.
        // Manager tự thêm/sửa môn sau đó.
        builder.HasData(
            new Sport { SportId = 1, Code = SportCodes.Gym, Name = "Gym", SortOrder = 1, IsActive = true },
            new Sport { SportId = 3, Code = "badminton", Name = "Cầu lông", SortOrder = 2, IsActive = true },
            new Sport { SportId = 4, Code = "basketball", Name = "Bóng rổ", SortOrder = 3, IsActive = true });
    }
}

public class SportServiceOfferingConfiguration : IEntityTypeConfiguration<SportServiceOffering>
{
    public void Configure(EntityTypeBuilder<SportServiceOffering> builder)
    {
        builder.ToTable("sport_service_offerings", t =>
        {
            t.HasCheckConstraint("ck_sport_service_offerings_type", "service_type BETWEEN 0 AND 3");
            // GroupCourse (=1) bắt buộc có thời lượng và sức chứa mặc định; dịch vụ khác phải để NULL.
            t.HasCheckConstraint("ck_sport_service_offerings_defaults",
                "(service_type = 1 AND default_session_minutes > 0 AND default_max_capacity > 0)"
                + " OR (service_type <> 1 AND default_session_minutes IS NULL AND default_max_capacity IS NULL)");
        });
        builder.HasKey(e => e.OfferingId);
        builder.HasIndex(e => new { e.SportId, e.ServiceType }).IsUnique();

        builder.HasOne<Sport>().WithMany(s => s.Services).HasForeignKey(e => e.SportId).OnDelete(DeleteBehavior.Cascade);

        // OfferingId cố định để seed các bảng liên kết tham chiếu được.
        builder.HasData(
            new SportServiceOffering { OfferingId = 1, SportId = 1, ServiceType = SportServiceType.MembershipAccess, IsEnabled = true },
            new SportServiceOffering { OfferingId = 2, SportId = 1, ServiceType = SportServiceType.PersonalTraining, IsEnabled = true },
            new SportServiceOffering { OfferingId = 3, SportId = 3, ServiceType = SportServiceType.GroupCourse, IsEnabled = true, DefaultSessionMinutes = 90, DefaultMaxCapacity = 12 },
            new SportServiceOffering { OfferingId = 4, SportId = 3, ServiceType = SportServiceType.CourtRental, IsEnabled = true },
            new SportServiceOffering { OfferingId = 5, SportId = 4, ServiceType = SportServiceType.GroupCourse, IsEnabled = true, DefaultSessionMinutes = 120, DefaultMaxCapacity = 20 },
            new SportServiceOffering { OfferingId = 6, SportId = 4, ServiceType = SportServiceType.CourtRental, IsEnabled = true });
    }
}

public class ServiceRoomTypeConfiguration : IEntityTypeConfiguration<ServiceRoomType>
{
    public void Configure(EntityTypeBuilder<ServiceRoomType> builder)
    {
        builder.ToTable("service_room_types");
        builder.HasKey(e => new { e.OfferingId, e.RoomTypeId });

        builder.HasOne<SportServiceOffering>().WithMany().HasForeignKey(e => e.OfferingId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<RoomType>().WithMany().HasForeignKey(e => e.RoomTypeId).OnDelete(DeleteBehavior.Restrict);

        // Phòng PT (loại phòng 2) là phòng hợp lệ của dịch vụ PT; phòng Gym (loại 1) thì không.
        builder.HasData(new ServiceRoomType { OfferingId = 2, RoomTypeId = 2 });
    }
}
