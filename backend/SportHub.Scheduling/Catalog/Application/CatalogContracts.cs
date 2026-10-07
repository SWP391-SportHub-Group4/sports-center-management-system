using System.ComponentModel.DataAnnotations;

namespace SportHub.Scheduling.Catalog.Application;

// --- Sport ---

public sealed record SportResponse(
    int SportId,
    string Code,
    string Name,
    string? Description,
    string? ImageUrl,
    int SortOrder,
    bool IsActive,
    IReadOnlyList<SportServiceResponse> Services,
    IReadOnlyList<ServiceReadinessResponse>? Readiness = null);

public sealed record SportServiceResponse(
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ServiceType,
    bool IsEnabled,
    int? DefaultSessionMinutes,
    int? DefaultMaxCapacity,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] int? OfferingId = null);

/// <summary>Phần còn thiếu để dịch vụ bán/publish được. Chỉ Manager thấy.</summary>
public sealed record ServiceReadinessResponse(
    [property: SportHub.BuildingBlocks.Api.WireEnum] string ServiceType,
    bool Ready,
    IReadOnlyList<string> Missing);

public sealed class SaveSportRequest
{
    /// <summary>Bắt buộc khi tạo (a-z, 0-9, _; 2-32 ký tự). Không đổi được sau khi tạo; PUT chỉ được gửi cùng mã hiện có hoặc bỏ trống.</summary>
    [MaxLength(32)]
    public string? Code { get; set; }

    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    public int SortOrder { get; set; }

    /// <summary>Tập dịch vụ của môn; thay thế toàn bộ khi sửa.</summary>
    [Required, MaxLength(8)]
    public List<SaveSportServiceRequest> Services { get; set; } = [];
}

public sealed class SaveSportServiceRequest
{
    /// <summary>MembershipAccess | GroupCourse | CourtRental | PersonalTraining.</summary>
    [Required]
    [SportHub.BuildingBlocks.Api.WireEnum] public string ServiceType { get; set; } = string.Empty;

    public bool IsEnabled { get; set; } = true;

    [Range(15, 480)]
    public int? DefaultSessionMinutes { get; set; }

    [Range(1, 500)]
    public int? DefaultMaxCapacity { get; set; }
}

public sealed class SetServiceRoomTypesRequest
{
    [Required, MaxLength(50)]
    public List<int> RoomTypeIds { get; set; } = [];
}

// --- Room type ---

public sealed record RoomTypeResponse(int RoomTypeId, string Name, IReadOnlyList<int> SportIds);

public sealed class SaveRoomTypeRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = string.Empty;
}

public sealed class SetRoomTypeSportsRequest
{
    [Required, MaxLength(50)]
    public List<int> SportIds { get; set; } = [];
}

// --- Opening hours ---

/// <summary>Giờ địa phương Asia/Ho_Chi_Minh, định dạng HH:mm.</summary>
public sealed record OpeningHourResponse(int DayOfWeek, string OpenTimeLocal, string CloseTimeLocal);

public sealed class OpeningHourInput
{
    /// <summary>0 = Chủ nhật … 6 = Thứ bảy.</summary>
    [Range(0, 6)]
    public int DayOfWeek { get; set; }

    [Required]
    public string OpenTimeLocal { get; set; } = string.Empty;

    [Required]
    public string CloseTimeLocal { get; set; } = string.Empty;
}

/// <summary>Thay toàn bộ giờ mở cửa của phòng; ngày không có trong danh sách = phòng đóng cửa ngày đó.</summary>
public sealed class SetOpeningHoursRequest
{
    [Required, MaxLength(7)]
    public List<OpeningHourInput> Hours { get; set; } = [];
}

// --- Room block ---

public sealed record RoomBlockResponse(
    Guid BlockId,
    int RoomId,
    DateTime StartAtUtc,
    DateTime EndAtUtc,
    string Reason,
    Guid? IncidentId,
    Guid CreatedByUserId);

public sealed class CreateRoomBlockRequest
{
    public int RoomId { get; set; }

    public DateTime StartAtUtc { get; set; }

    public DateTime EndAtUtc { get; set; }

    [Required, MinLength(3), MaxLength(500)]
    public string Reason { get; set; } = string.Empty;
}

// --- Court rate ---

public sealed record CourtRateResponse(
    int RateId,
    int RoomTypeId,
    int? SportId,
    string DaysOfWeek,
    string StartTimeLocal,
    string EndTimeLocal,
    decimal PricePerHour,
    bool IsActive);

public sealed class SaveCourtRateRequest
{
    public int RoomTypeId { get; set; }

    /// <summary>Null = áp dụng mọi môn chơi được ở loại sân này.</summary>
    public int? SportId { get; set; }

    /// <summary>MON, TUE, WED, THU, FRI, SAT, SUN.</summary>
    [Required, MinLength(1), MaxLength(7)]
    public List<string> DaysOfWeek { get; set; } = [];

    [Required]
    public string StartTimeLocal { get; set; } = string.Empty;

    [Required]
    public string EndTimeLocal { get; set; } = string.Empty;

    /// <summary>VND, dương và bội số 1.000.</summary>
    public decimal PricePerHour { get; set; }

    public bool IsActive { get; set; } = true;
}
