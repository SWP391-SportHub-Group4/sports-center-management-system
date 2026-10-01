using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>
/// CRUD môn thể thao (BR-106/107). Ngừng hoạt động thay cho xóa cứng; môn ngừng hoạt động chặn booking mới
/// nhưng không đụng dữ liệu cũ. Loại vận hành (operation_type) không đổi được sau khi tạo để không làm sai lệch các
/// thực thể đã gắn với môn.
/// </summary>
public sealed class SportCatalogService(ISportHubDbContext db, IAuditWriter audit)
{
    /// <summary>Danh sách công khai chỉ gồm môn đang hoạt động; Manager xem cả môn đã ngừng.</summary>
    public async Task<IReadOnlyList<SportResponse>> ListAsync(bool includeInactive, CancellationToken ct = default)
        => await db.Set<Sport>()
            .AsNoTracking()
            .Where(s => includeInactive || s.IsActive)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .Select(s => ToResponse(s))
            .ToListAsync(ct);

    public async Task<SportResponse> CreateAsync(SaveSportRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var operationType = ParseOperationType(request.OperationType);
        var name = request.Name.Trim();

        ValidateDefaults(operationType, request);

        if (await db.Set<Sport>().AnyAsync(s => s.Name == name, ct))
        {
            throw new ConflictException("sport_name_taken", "Đã có môn trùng tên.");
        }

        var sport = new Sport
        {
            Name = name,
            OperationType = operationType,
            DefaultSessionMinutes = request.DefaultSessionMinutes,
            DefaultMaxCapacity = request.DefaultMaxCapacity,
            Description = Clean(request.Description),
            ImageUrl = Clean(request.ImageUrl),
            SortOrder = request.SortOrder,
            IsActive = true
        };

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        db.Set<Sport>().Add(sport);
        await db.SaveChangesAsync(ct); // unique citext trên name là nơi chặn thật khi hai request đồng thời

        audit.Write(new AuditEntry(actorUserId, "CREATE_SPORT", nameof(Sport), sport.SportId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { name, operationType = operationType.ToString() })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return ToResponse(sport);
    }

    public async Task<SportResponse> UpdateAsync(int sportId, SaveSportRequest request, Guid actorUserId, CancellationToken ct = default)
    {
        var sport = await FindAsync(sportId, ct);
        var operationType = ParseOperationType(request.OperationType);

        if (operationType != sport.OperationType)
        {
            throw new BadRequestException("sport_operation_type_immutable", "Không đổi được loại vận hành của môn sau khi tạo.");
        }

        ValidateDefaults(operationType, request);

        var name = request.Name.Trim();
        if (await db.Set<Sport>().AnyAsync(s => s.Name == name && s.SportId != sportId, ct))
        {
            throw new ConflictException("sport_name_taken", "Đã có môn trùng tên.");
        }

        var before = System.Text.Json.JsonSerializer.Serialize(new { name = sport.Name, defaultSessionMinutes = sport.DefaultSessionMinutes });

        // Đổi mặc định chỉ có tác dụng với lớp/lịch tạo sau, không sửa lịch cũ.
        sport.Name = name;
        sport.DefaultSessionMinutes = request.DefaultSessionMinutes;
        sport.DefaultMaxCapacity = request.DefaultMaxCapacity;
        sport.Description = Clean(request.Description);
        sport.ImageUrl = Clean(request.ImageUrl);
        sport.SortOrder = request.SortOrder;

        audit.Write(new AuditEntry(actorUserId, "UPDATE_SPORT", nameof(Sport), sportId.ToString(),
            OldValue: before,
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { name, defaultSessionMinutes = sport.DefaultSessionMinutes })));

        await db.SaveChangesAsync(ct);
        return ToResponse(sport);
    }

    public Task<SportResponse> DeactivateAsync(int sportId, Guid actorUserId, CancellationToken ct = default)
        => SetActiveAsync(sportId, false, "DEACTIVATE_SPORT", actorUserId, ct);

    public Task<SportResponse> ActivateAsync(int sportId, Guid actorUserId, CancellationToken ct = default)
        => SetActiveAsync(sportId, true, "ACTIVATE_SPORT", actorUserId, ct);

    private async Task<SportResponse> SetActiveAsync(int sportId, bool active, string action, Guid actorUserId, CancellationToken ct)
    {
        var sport = await FindAsync(sportId, ct);

        if (sport.IsActive != active)
        {
            sport.IsActive = active;
            audit.Write(new AuditEntry(actorUserId, action, nameof(Sport), sportId.ToString(),
                OldValue: "{\"isActive\":" + (!active).ToString().ToLowerInvariant() + "}",
                NewValue: "{\"isActive\":" + active.ToString().ToLowerInvariant() + "}"));
            await db.SaveChangesAsync(ct);
        }

        return ToResponse(sport);
    }

    private async Task<Sport> FindAsync(int sportId, CancellationToken ct)
        => await db.Set<Sport>().SingleOrDefaultAsync(s => s.SportId == sportId, ct)
           ?? throw new NotFoundException("sport_not_found", "Không tìm thấy môn.");

    private static void ValidateDefaults(SportOperationType type, SaveSportRequest request)
    {
        if (type == SportOperationType.GroupCourse
            && (request.DefaultSessionMinutes is null || request.DefaultMaxCapacity is null))
        {
            throw new BadRequestException(
                "sport_group_course_defaults_required",
                "Môn dạng khóa học nhóm bắt buộc có thời lượng buổi và sức chứa mặc định.");
        }
    }

    private static SportOperationType ParseOperationType(string value)
        => SportHub.BuildingBlocks.Api.WireEnum.TryParse<SportOperationType>(value, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed
            : throw new BadRequestException("invalid_operation_type", "Loại vận hành không hợp lệ (WalkIn, OneOnOne, GroupCourse).");

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static SportResponse ToResponse(Sport s) => new(
        s.SportId, s.Name, s.OperationType.ToString(), s.DefaultSessionMinutes, s.DefaultMaxCapacity,
        s.Description, s.ImageUrl, s.SortOrder, s.IsActive);
}
