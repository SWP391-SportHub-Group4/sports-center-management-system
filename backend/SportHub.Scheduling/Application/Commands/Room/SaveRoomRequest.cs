using System.ComponentModel.DataAnnotations;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Application.Commands;

public sealed class SaveRoomRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [Range(1, 500)]
    public int Capacity { get; set; }

    /// <summary>Legacy metadata accepted for compatibility; no longer assigns or restricts a physical room to a sport.</summary>
    public int? SportId { get; set; }

    /// <summary>Optional legacy pricing group; new clients do not select room types.</summary>
    public int? RoomTypeId { get; set; }

    /// <summary>Ngừng/kích hoạt phòng. Null: tạo mới = hoạt động, cập nhật = giữ nguyên. Phòng ngừng chặn booking mới, không đụng lịch cũ.</summary>
    public bool? IsActive { get; set; }

    /// <summary>Null preserves the current rental state; new rooms default to false.</summary>
    public bool? AllowRental { get; set; }

    /// <summary>Creation-only rental price and weekly hours; required when creating a rentable room.</summary>
    public RoomCreationRentalSetup? RentalSetup { get; set; }
}

public sealed class RoomCreationRentalSetup
{
    public decimal PricePerHour { get; set; }

    [Required, MinLength(1), MaxLength(7)]
    public List<OpeningHourInput> Hours { get; set; } = [];
}
