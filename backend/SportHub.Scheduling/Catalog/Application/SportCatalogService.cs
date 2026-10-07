using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>
/// CRUD môn thể thao và dịch vụ của môn (BR-106/107, CAT-01). Ngừng hoạt động thay cho xóa cứng; tắt môn hoặc dịch vụ
/// chỉ chặn giao dịch mới, không đụng thứ đã bán. <c>code</c> không đổi được sau khi tạo.
/// Membership/PT chỉ bật được ở môn tham chiếu Gym (<see cref="SportCodes.Gym"/>), kiểm ở backend.
/// </summary>
public sealed partial class SportCatalogService(ISportHubDbContext db, IAuditWriter audit, ServiceUsageGuard usage)
{
    /// <summary>Danh sách công khai chỉ gồm môn đang hoạt động và dịch vụ đang bật; Manager xem tất cả kèm readiness.</summary>
    public async Task<IReadOnlyList<SportResponse>> ListAsync(bool includeInactive, CancellationToken ct = default,
        SportServiceType? serviceFilter = null)
    {
        var sports = await db.Set<Sport>().AsNoTracking()
            .Include(s => s.Services)
            .Where(s => includeInactive || s.IsActive)
            .OrderByDescending(s => s.IsActive)
            .ThenBy(s => s.SortOrder).ThenBy(s => s.SportId)
            .ToListAsync(ct);

        var readiness = includeInactive ? await ReadinessAsync(sports, ct) : null;

        return sports
            .Where(s => serviceFilter is null
                        || s.Services.Any(x => x.ServiceType == serviceFilter && (includeInactive || x.IsEnabled)))
            .Select(s => ToResponse(s, publicView: !includeInactive, readiness?.GetValueOrDefault(s.SportId)))
            .ToList();
    }

    public async Task<SportResponse> CreateAsync(SaveSportRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var code = NormalizeCode(request.Code)
                   ?? throw new BadRequestException("sport_code_invalid", "Mã môn bắt buộc, gồm a-z, 0-9, _ (2-32 ký tự).");
        var name = request.Name.Trim();
        var services = ValidateServices(code, request.Services);

        if (await db.Set<Sport>().AnyAsync(s => s.Code == code, ct))
        {
            throw new ConflictException("sport_code_taken", "Mã môn đã được dùng.");
        }

        if (await db.Set<Sport>().AnyAsync(s => s.Name == name, ct))
        {
            throw new ConflictException("sport_name_taken", "Đã có môn trùng tên.");
        }

        var sport = new Sport
        {
            Code = code,
            Name = name,
            Description = Clean(request.Description),
            ImageUrl = Clean(request.ImageUrl),
            IsActive = true,
            Services = services
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var ordered = await LockAndListSportsAsync(ct);
        ordered.Add(sport);
        AssignSortOrders(ordered);

        db.Set<Sport>().Add(sport);
        await db.SaveChangesAsync(ct); // unique citext trên code/name là nơi chặn thật khi hai request đồng thời

        audit.Write(new AuditEntry(actorUserId, "CREATE_SPORT", nameof(Sport), sport.SportId.ToString(),
            NewValue: Describe(sport)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return ToResponse(sport, publicView: false, null);
    }

    public async Task<SportResponse> UpdateAsync(int sportId, SaveSportRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var sport = await FindAsync(sportId, ct);

        if (!string.IsNullOrWhiteSpace(request.Code)
            && !string.Equals(request.Code.Trim(), sport.Code, StringComparison.OrdinalIgnoreCase))
        {
            throw new BadRequestException("sport_code_immutable", "Không đổi được mã môn sau khi tạo.");
        }

        var name = request.Name.Trim();
        var requested = ValidateServices(sport.Code, request.Services);

        if (await db.Set<Sport>().AnyAsync(s => s.Name == name && s.SportId != sportId, ct))
        {
            throw new ConflictException("sport_name_taken", "Đã có môn trùng tên.");
        }

        var before = Describe(sport);

        sport.Name = name;
        sport.Description = Clean(request.Description);
        sport.ImageUrl = Clean(request.ImageUrl);

        // Đổi mặc định chỉ có tác dụng với lớp tạo sau, không sửa lịch cũ. Dịch vụ không còn trong yêu cầu chỉ bị TẮT,
        // không bị xóa: dịch vụ đã bán/đang có lịch vẫn đọc được.
        foreach (var existing in sport.Services)
        {
            var match = requested.SingleOrDefault(r => r.ServiceType == existing.ServiceType);
            existing.IsEnabled = match?.IsEnabled ?? false;
            if (match is not null)
            {
                existing.DefaultSessionMinutes = match.DefaultSessionMinutes;
                existing.DefaultMaxCapacity = match.DefaultMaxCapacity;
            }
        }

        foreach (var added in requested.Where(r => sport.Services.All(x => x.ServiceType != r.ServiceType)))
        {
            sport.Services.Add(added);
        }

        audit.Write(new AuditEntry(actorUserId, "UPDATE_SPORT", nameof(Sport), sportId.ToString(),
            OldValue: before,
            NewValue: Describe(sport)));

        await db.SaveChangesAsync(ct);
        return ToResponse(sport, publicView: false, null);
    }

    public Task<SportResponse> DeactivateAsync(int sportId, Guid actorUserId, CancellationToken ct = default)
        => SetActiveAsync(sportId, false, "DEACTIVATE_SPORT", actorUserId, ct);

    public Task<SportResponse> ActivateAsync(int sportId, Guid actorUserId, CancellationToken ct = default)
        => SetActiveAsync(sportId, true, "ACTIVATE_SPORT", actorUserId, ct);

    /// <summary>Bật/tắt một dịch vụ đã cấu hình. Tắt dịch vụ này không tắt dịch vụ khác và không hủy thứ đã mua.</summary>
    public async Task<SportResponse> SetServiceEnabledAsync(int sportId, SportServiceType type, bool enabled, Guid actorUserId,
        CancellationToken ct = default)
    {
        var sport = await FindAsync(sportId, ct);
        var offering = sport.Services.SingleOrDefault(s => s.ServiceType == type)
                       ?? throw new NotFoundException("service_not_configured", "Môn chưa cấu hình dịch vụ này.");

        if (offering.IsEnabled != enabled)
        {
            var before = System.Text.Json.JsonSerializer.Serialize(new { targetName = sport.Name, sportId, serviceType = type.ToString(), enabled = offering.IsEnabled });
            offering.IsEnabled = enabled;
            audit.Write(new AuditEntry(actorUserId, enabled ? "ENABLE_SPORT_SERVICE" : "DISABLE_SPORT_SERVICE",
                nameof(SportServiceOffering), offering.OfferingId.ToString(),
                OldValue: before,
                NewValue: System.Text.Json.JsonSerializer.Serialize(new { targetName = sport.Name, sportId, serviceType = type.ToString(), enabled })));
            await db.SaveChangesAsync(ct);
        }

        return ToResponse(sport, publicView: false, null);
    }

    /// <summary>Tập loại phòng cho dịch vụ PT. Tập rỗng nghĩa là PT không gắn phòng.</summary>
    public async Task<IReadOnlyList<int>> SetServiceRoomTypesAsync(int sportId, SportServiceType type, IEnumerable<int> roomTypeIds,
        Guid actorUserId, CancellationToken ct = default)
    {
        if (type != SportServiceType.PersonalTraining)
        {
            throw new BadRequestException("service_room_types_not_supported",
                "Chỉ dịch vụ PT thu hẹp loại phòng riêng; lớp và thuê sân dùng loại phòng của môn.");
        }

        var sport = await FindAsync(sportId, ct);
        var offering = sport.Services.SingleOrDefault(s => s.ServiceType == type)
                       ?? throw new NotFoundException("service_not_configured", "Môn chưa cấu hình dịch vụ này.");
        var ids = roomTypeIds.Distinct().OrderBy(x => x).ToList();

        var known = await db.Set<RoomType>().Where(r => ids.Contains(r.RoomTypeId)).Select(r => r.RoomTypeId).ToListAsync(ct);
        if (known.Count != ids.Count)
        {
            throw new BadRequestException("invalid_room_type", "Có loại phòng không tồn tại.");
        }

        // Loại phòng phải thuộc môn (sport_room_types) để phòng PT vẫn tương thích môn Gym.
        var sportRoomTypes = await db.Set<SportRoomType>().Where(l => l.SportId == sportId).Select(l => l.RoomTypeId).ToListAsync(ct);
        if (ids.Any(id => !sportRoomTypes.Contains(id)))
        {
            throw new BadRequestException("room_type_not_linked_to_sport", "Loại phòng chưa được gán cho môn này.");
        }

        var current = await db.Set<ServiceRoomType>().Where(l => l.OfferingId == offering.OfferingId).ToListAsync(ct);
        var removed = current.Where(l => !ids.Contains(l.RoomTypeId)).ToList();
        await usage.RequireNoFuturePtInRoomTypesAsync(removed.Select(l => l.RoomTypeId).ToList(), ct);
        db.Set<ServiceRoomType>().RemoveRange(removed);
        db.Set<ServiceRoomType>().AddRange(ids.Where(id => current.All(l => l.RoomTypeId != id))
            .Select(id => new ServiceRoomType { OfferingId = offering.OfferingId, RoomTypeId = id }));

        audit.Write(new AuditEntry(actorUserId, "SET_SERVICE_ROOM_TYPES", nameof(SportServiceOffering), offering.OfferingId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { targetName = sport.Name, sportId, serviceType = type.ToString(), roomTypeIds = current.Select(x => x.RoomTypeId).OrderBy(x => x) }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { targetName = sport.Name, sportId, serviceType = type.ToString(), roomTypeIds = ids })));
        await db.SaveChangesAsync(ct);
        return ids;
    }

    private async Task<SportResponse> SetActiveAsync(int sportId, bool active, string action, Guid actorUserId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var ordered = await LockAndListSportsAsync(ct);
        // Load the current state only after taking the catalog lock.
        var sport = await FindAsync(sportId, ct);
        if (sport.IsActive != active)
        {
            var before = System.Text.Json.JsonSerializer.Serialize(new { name = sport.Name, code = sport.Code, isActive = sport.IsActive, sortOrder = sport.SortOrder });
            ordered.Remove(sport);
            sport.IsActive = active;
            ordered.Add(sport); // Append to the end of its new activity group.
            AssignSortOrders(ordered);
            audit.Write(new AuditEntry(actorUserId, action, nameof(Sport), sportId.ToString(),
                OldValue: before,
                NewValue: System.Text.Json.JsonSerializer.Serialize(new { name = sport.Name, code = sport.Code, isActive = active, sortOrder = sport.SortOrder })));
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return ToResponse(sport, publicView: false, null);
    }

    private static string Describe(Sport sport) => System.Text.Json.JsonSerializer.Serialize(new
    {
        code = sport.Code, name = sport.Name, description = sport.Description, imageUrl = sport.ImageUrl,
        isActive = sport.IsActive, sortOrder = sport.SortOrder,
        services = sport.Services.OrderBy(x => x.ServiceType).Select(x => new
        {
            serviceType = x.ServiceType.ToString(), isEnabled = x.IsEnabled,
            defaultSessionMinutes = x.DefaultSessionMinutes, defaultMaxCapacity = x.DefaultMaxCapacity
        })
    });

    private async Task<List<Sport>> LockAndListSportsAsync(CancellationToken ct)
    {
        // PostgreSQL table lock also covers an empty catalog. Serializes create and
        // activity changes across API instances until their transaction commits.
        await db.Database.ExecuteSqlRawAsync("LOCK TABLE sports IN SHARE ROW EXCLUSIVE MODE", ct);
        return await db.Set<Sport>()
            .OrderByDescending(s => s.IsActive).ThenBy(s => s.SortOrder)
            .ThenBy(s => s.Name).ThenBy(s => s.SportId).ToListAsync(ct);
    }

    private static void AssignSortOrders(IReadOnlyList<Sport> sports)
    {
        var rank = 1;
        foreach (var sport in sports.Where(s => s.IsActive).Concat(sports.Where(s => !s.IsActive)))
            sport.SortOrder = rank++;
    }

    private async Task<Sport> FindAsync(int sportId, CancellationToken ct)
        => await db.Set<Sport>().Include(s => s.Services).SingleOrDefaultAsync(s => s.SportId == sportId, ct)
           ?? throw new NotFoundException("sport_not_found", "Không tìm thấy môn.");

    /// <summary>Kiểm tập dịch vụ: loại hợp lệ, không trùng, mặc định đúng loại, Membership/PT chỉ ở Gym.</summary>
    private static List<SportServiceOffering> ValidateServices(string sportCode, IEnumerable<SaveSportServiceRequest> requested)
    {
        var result = new List<SportServiceOffering>();

        foreach (var item in requested)
        {
            if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<SportServiceType>(item.ServiceType, ignoreCase: true, out var type)
                || !Enum.IsDefined(type))
            {
                throw new BadRequestException("service_type_invalid",
                    "Loại dịch vụ không hợp lệ (MembershipAccess, GroupCourse, CourtRental, PersonalTraining).");
            }

            if (result.Any(r => r.ServiceType == type))
            {
                throw new BadRequestException("service_type_invalid", "Dịch vụ bị khai báo trùng.");
            }

            if (type is SportServiceType.MembershipAccess or SportServiceType.PersonalTraining
                && !string.Equals(sportCode, SportCodes.Gym, StringComparison.OrdinalIgnoreCase))
            {
                throw new BadRequestException("service_not_allowed_for_sport",
                    "Membership và PT chỉ thuộc môn Gym trong phạm vi hiện tại.");
            }

            if (type == SportServiceType.GroupCourse)
            {
                if (item.DefaultSessionMinutes is null || item.DefaultMaxCapacity is null)
                {
                    throw new BadRequestException("sport_group_course_defaults_required",
                        "Khóa học nhóm bắt buộc có thời lượng buổi và sức chứa mặc định.");
                }
            }
            else if (item.DefaultSessionMinutes is not null || item.DefaultMaxCapacity is not null)
            {
                throw new BadRequestException("service_defaults_not_allowed",
                    "Chỉ khóa học nhóm có thời lượng và sức chứa mặc định.");
            }

            result.Add(new SportServiceOffering
            {
                ServiceType = type,
                IsEnabled = item.IsEnabled,
                DefaultSessionMinutes = item.DefaultSessionMinutes,
                DefaultMaxCapacity = item.DefaultMaxCapacity
            });
        }

        return result;
    }

    /// <summary>Phần còn thiếu để GroupCourse/CourtRental bán được; Membership/PT có cấu hình riêng ở module khác.</summary>
    private async Task<Dictionary<int, IReadOnlyList<ServiceReadinessResponse>>> ReadinessAsync(List<Sport> sports, CancellationToken ct)
    {
        var sportIds = sports.Select(s => s.SportId).ToList();
        var links = await db.Set<SportRoomType>().AsNoTracking().Where(l => sportIds.Contains(l.SportId)).ToListAsync(ct);
        var rooms = await db.Set<Room>().AsNoTracking().Where(r => r.IsActive && r.RoomTypeId != null).ToListAsync(ct);
        var hours = await db.Set<RoomOpeningHour>().AsNoTracking().Select(h => h.RoomId).Distinct().ToListAsync(ct);
        var rates = await db.Set<CourtRate>().AsNoTracking().Where(r => r.IsActive).ToListAsync(ct);

        var result = new Dictionary<int, IReadOnlyList<ServiceReadinessResponse>>();

        foreach (var sport in sports)
        {
            var roomTypeIds = links.Where(l => l.SportId == sport.SportId).Select(l => l.RoomTypeId).ToHashSet();
            var sportRooms = rooms.Where(r => roomTypeIds.Contains(r.RoomTypeId!.Value)).ToList();
            var list = new List<ServiceReadinessResponse>();

            foreach (var service in sport.Services.Where(s => s.ServiceType is SportServiceType.GroupCourse or SportServiceType.CourtRental))
            {
                var missing = new List<string>();
                if (roomTypeIds.Count == 0) missing.Add("room_type");
                if (sportRooms.Count == 0) missing.Add("room");
                if (!sportRooms.Any(r => hours.Contains(r.RoomId))) missing.Add("opening_hours");

                if (service.ServiceType == SportServiceType.CourtRental
                    && !rates.Any(r => roomTypeIds.Contains(r.RoomTypeId) && (r.SportId == null || r.SportId == sport.SportId)))
                {
                    missing.Add("court_rate");
                }

                list.Add(new ServiceReadinessResponse(service.ServiceType.ToString(), missing.Count == 0, missing));
            }

            result[sport.SportId] = list;
        }

        return result;
    }

    private static string? NormalizeCode(string? value)
    {
        var code = value?.Trim().ToLowerInvariant();
        return code is not null && SportCodePattern().IsMatch(code) ? code : null;
    }

    [GeneratedRegex("^[a-z0-9_]{2,32}$")]
    private static partial Regex SportCodePattern();

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static SportResponse ToResponse(Sport s, bool publicView, IReadOnlyList<ServiceReadinessResponse>? readiness) => new(
        s.SportId, s.Code, s.Name, s.Description, s.ImageUrl, s.SortOrder, s.IsActive,
        s.Services.Where(x => !publicView || x.IsEnabled).OrderBy(x => x.ServiceType)
            .Select(x => new SportServiceResponse(x.ServiceType.ToString(), x.IsEnabled, x.DefaultSessionMinutes, x.DefaultMaxCapacity, publicView ? null : x.OfferingId))
            .ToList(),
        publicView ? null : readiness);
}
