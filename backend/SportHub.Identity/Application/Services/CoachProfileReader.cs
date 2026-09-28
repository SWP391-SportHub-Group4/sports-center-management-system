using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Identity.Application.Services;

public sealed class CoachProfileReader(ISportHubDbContext db, ILogger<CoachProfileReader> logger)
    : ICoachProfileReader
{
    public async Task<CoachCategory?> GetCategoryAsync(Guid userId, CancellationToken ct = default)
        => (await db.Set<CoachProfile>()
                .AsNoTracking()
                .SingleOrDefaultAsync(p => p.UserId == userId, ct))
            ?.CoachCategory;

    public async Task<CoachCategory> RequireCoachWithProfileAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await db.Set<UserAccount>()
                .AsNoTracking()
                .Include(u => u.Role)
                .Include(u => u.CoachProfile)
                .SingleOrDefaultAsync(u => u.UserId == userId, ct)
            ?? throw new NotFoundException("user_not_found", "Không tìm thấy tài khoản.");

        if (user.Role!.RoleName != UserRole.Coach)
        {
            throw new ForbiddenException(
                "coach_role_required", "Chức năng này chỉ dành cho tài khoản role Coach.");
        }

        if (user.CoachProfile is null)
        {
            // Không nên xảy ra: CreateStaffAsync luôn tạo CoachProfile cùng lúc với role Coach
            // (BR-96). Nếu tới đây tức là có đường tạo/đổi role khác đang bỏ sót ràng buộc đó —
            // ghi log riêng để phát hiện, không lặng lẽ coi như người dùng thiếu quyền.
            logger.LogError(
                "Invariant violated: UserAccount {UserId} has role Coach but no CoachProfile", userId);

            throw new AppException(
                StatusCodes.Status500InternalServerError,
                "coach_profile_missing",
                "Tài khoản Coach thiếu CoachProfile — dữ liệu không nhất quán, vui lòng báo quản trị.");
        }

        return user.CoachProfile.CoachCategory;
    }

    public async Task RequireCategoryAsync(Guid userId, CoachCategory required, CancellationToken ct = default)
    {
        var actual = await RequireCoachWithProfileAsync(userId, ct);

        if (actual != required)
        {
            throw new ForbiddenException(
                "coach_category_forbidden", $"Chức năng này chỉ dành cho Coach loại {required}.");
        }
    }
}
