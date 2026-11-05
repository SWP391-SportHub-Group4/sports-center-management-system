using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Training.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>Member-only read-only evidence. Member ID always originates in authenticated JWT.</summary>
internal static class MemberCenterFactsV27
{
    internal static async Task<object> SportsAsync(ISportHubDbContext db, Guid memberId, CancellationToken ct)
    {
        await RequireMemberAsync(db, memberId, ct);
        var sports = await db.Set<Sport>().AsNoTracking()
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .Select(s => new { s.SportId, s.Code, s.Name, s.Description, s.IsActive }).ToListAsync(ct);
        var offerings = await db.Set<SportServiceOffering>().AsNoTracking()
            .Where(o => o.IsEnabled).Select(o => new { o.SportId, o.ServiceType }).ToListAsync(ct);
        var services = offerings.GroupBy(o => o.SportId).ToDictionary(g => g.Key,
            g => g.Select(x => x.ServiceType.ToString()).Distinct().OrderBy(x => x).ToArray());
        return new {
            exactActiveSportCount = sports.Count(s => s.IsActive),
            exactTotalSportCount = sports.Count,
            activeSports = sports.Select(s => new { s.SportId, s.Code, s.Name, s.Description, s.IsActive,
                enabledServices = services.GetValueOrDefault(s.SportId, Array.Empty<string>()) }).ToArray(),
            important = "All Sport rows are listed with IsActive status. Current active sports are those with IsActive=true. Different features may expose historical or disabled sports; do not claim a sport is currently offered solely because it appears in an old workout. Group classes, court rentals and workout activity filters are distinct catalogs."
        };
    }

    internal static async Task<object> PlansAsync(ISportHubDbContext db, Guid memberId, CancellationToken ct)
    {
        await RequireMemberAsync(db, memberId, ct);
        var plans = db.Set<WorkoutPlan>().AsNoTracking().Where(p => p.MemberId == memberId);
        var total = await plans.CountAsync(ct);
        var recent = await plans.OrderByDescending(p => p.CreatedAt).Take(25)
            .Select(p => new { p.PlanId, p.Goal, p.Level, p.Status, p.Version, p.CreatedAt, p.UpdatedAt,
                coachName = p.Coach != null && p.Coach.Profile != null ? p.Coach.Profile.FullName : null })
            .ToListAsync(ct);
        var ids = recent.Select(p => p.PlanId).ToList();
        var items = await db.Set<WorkoutPlanItem>().AsNoTracking()
            .Where(i => ids.Contains(i.PlanId)).OrderBy(i => i.ItemId)
            .Select(i => new { i.PlanId, i.Exercise, i.Sets, i.Reps, i.Notes }).Take(500).ToListAsync(ct);
        var suggestions = await db.Set<AiLog>().AsNoTracking()
            .Where(x => x.UserId == memberId && x.QueryType == "WORKOUT_SUGGESTION")
            .OrderByDescending(x => x.CreatedAt).Take(15)
            .Select(x => new { x.CreatedAt, x.InputPayload, x.ResponsePayload }).ToListAsync(ct);
        var previews = new List<object>();
        foreach (var s in suggestions)
        {
            // Do not expose arbitrary stored prompt text or unrelated account information to the model.
            string? goal = null, sport = null, rationale = null;
            var exercises = new List<string>();
            try
            {
                using var input = JsonDocument.Parse(s.InputPayload);
                if (input.RootElement.TryGetProperty("Goal", out var g)) goal = g.ToString();
                if (input.RootElement.TryGetProperty("Sport", out var sp)) sport = sp.ToString();
                using var response = JsonDocument.Parse(s.ResponsePayload);
                if (response.RootElement.TryGetProperty("rationale", out var r) && r.ValueKind == JsonValueKind.String)
                    rationale = (r.GetString() ?? "")[..Math.Min(1200, (r.GetString() ?? "").Length)];
                if (response.RootElement.TryGetProperty("exercises", out var e) && e.ValueKind == JsonValueKind.Array)
                    exercises = e.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String)
                        .Take(20).Select(x => (x.GetString() ?? "")[..Math.Min(180, (x.GetString() ?? "").Length)]).ToList();
            }
            catch (JsonException) { /* Older log formats are not silently invented. */ }
            previews.Add(new { s.CreatedAt, goal, sport, rationale, exercises });
        }
        return new {
            exactSavedCoachPlanCount = total, savedPlans = recent.Select(p => new {
                p.PlanId, p.Goal, p.Level, status = p.Status.ToString(), p.Version,
                p.CreatedAt, p.UpdatedAt,
                createdAtVietnam = VietnamTime.ToLocal(p.CreatedAt).ToString("yyyy-MM-dd HH:mm"),
                updatedAtVietnam = VietnamTime.ToLocal(p.UpdatedAt).ToString("yyyy-MM-dd HH:mm"),
                p.coachName,
                exercises = items.Where(i => i.PlanId == p.PlanId).Select(i => new { i.Exercise, i.Sets, i.Reps, i.Notes }).ToList()
            }).ToList(), plansTruncated = total > recent.Count,
            recentMemberWorkoutSuggestionPreviews = previews,
            timeZone = "Asia/Ho_Chi_Minh (UTC+07:00)",
            note = "Coach-authored plans and generated AI workout suggestions are different sources. Only plans and logs for the authenticated member are included. Older preview formats may lack details; do not invent missing exercises."
        };
    }

    private static async Task RequireMemberAsync(ISportHubDbContext db, Guid memberId, CancellationToken ct)
    {
        if (memberId == Guid.Empty || !await db.Set<UserAccount>().AsNoTracking().AnyAsync(u =>
            u.UserId == memberId && u.Role != null && u.Role.RoleName == UserRole.Member, ct))
            throw new UnauthorizedAccessException("Member-only evidence access denied.");
    }
}
