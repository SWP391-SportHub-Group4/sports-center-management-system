using Microsoft.Extensions.Logging;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Notification.Domain.Entities;
using SportHub.Scheduling.Rental.Domain;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using System.Text.Json;
using SportHub.Scheduling.Application.Services;

namespace SportHub.AI.Application.Services;

public sealed class SportHubAiContextBuilder(
    ISportHubDbContext db,
    IClock clock,
    Microsoft.Extensions.Logging.ILogger<SportHubAiContextBuilder> logger) : IAiContextBuilder
{
    private const int UpcomingWindowDays = 14;
    private const int MaxUpcomingSessions = 30;

    public async Task<string> BuildAsync(
        Guid userId,
        string question,
        CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var until = now.AddDays(UpcomingWindowDays);

        // Coach context is scoped to the authenticated coach, never a member's user ID.
        var isCoach = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking().AnyAsync(u => u.UserId == userId && u.Role != null &&
                u.Role.RoleName == UserRole.Coach, cancellationToken);
        if (isCoach)
        {
            var coachSessions = await db.Set<ClassSession>().AsNoTracking()
                .Where(s => s.CoachId == userId && s.StartAtUtc >= now.AddDays(-30) && s.StartAtUtc <= until)
                .OrderBy(s => s.StartAtUtc).Take(40)
                .Select(s => new { s.ClassId, s.SessionId, className = s.Class != null ? s.Class.Name : "Unknown",
                    s.StartAtUtc, s.EndAtUtc, status = s.Status.ToString() })
                .ToListAsync(cancellationToken);
            var classIds = coachSessions.Select(s => s.ClassId).Distinct().ToArray();
            var teachingRecords = await db.Set<ClassTeachingRecord>().AsNoTracking()
                .Where(r => r.CoachId == userId && classIds.Contains(r.ClassId))
                .OrderByDescending(r => r.UpdatedAtUtc).Take(20)
                .Select(r => new { r.RecordId, r.ClassId, r.SessionId, r.Kind, r.Title,
                    r.UpdatedAtUtc, content = r.Content.Length > 1200 ? r.Content.Substring(0, 1200) : r.Content })
                .ToListAsync(cancellationToken);
            // Same ownership rule as MemberSupportRequestsController.VisibleRequests():
            // a Coach can only read support requests assigned to their own account.
            var assignedSupportRequests = await db.Set<MemberSupportRequest>().AsNoTracking()
                .Where(r => r.AssignedToUserId == userId)
                .OrderByDescending(r => r.UpdatedAt ?? r.CreatedAt)
                .Take(80)
                .Select(r => new { r.RequestId, r.MemberId, r.Category, r.Subject,
                    r.Status, r.CreatedAt, r.UpdatedAt, r.SlaDueAtUtc,
                    r.ProgressNote })
                .ToListAsync(cancellationToken);
            // Resolve member names only for support requests assigned to this Coach.
            // Do not expose unrelated member profiles or email addresses to the assistant.
            var visibleMemberIds = assignedSupportRequests.Select(r => r.MemberId).Distinct().ToArray();
            var visibleMemberProfiles = await db.Set<UserProfile>().AsNoTracking()
                .Where(p => visibleMemberIds.Contains(p.UserId))
                .Select(p => new { p.UserId, p.FullName })
                .ToDictionaryAsync(p => p.UserId, p => p.FullName, cancellationToken);
            var namedSupportRequests = assignedSupportRequests.Select(r => new {
                r.RequestId, r.MemberId,
                memberName = visibleMemberProfiles.TryGetValue(r.MemberId, out var name)
                    && !string.IsNullOrWhiteSpace(name) ? name : (string?)null,
                r.Category, r.Subject, r.Status, r.CreatedAt, r.UpdatedAt,
                r.SlaDueAtUtc, r.ProgressNote
            }).ToList();
            var supportStats = new {
                notStarted = assignedSupportRequests.Count(r => r.Status is "OPEN" or "ASSIGNED"),
                inProgress = assignedSupportRequests.Count(r => r.Status == "IN_PROGRESS"),
                done = assignedSupportRequests.Count(r => r.Status is "DONE" or "CLOSED"),
                overdue = assignedSupportRequests.Count(r => r.Status is not ("DONE" or "CLOSED" or "REJECTED") && r.SlaDueAtUtc <= now),
                note = "These counts cover the 80 most recently updated requests returned in this snapshot."
            };
            var absenceRequests = await db.Set<ClassSessionChangeRequest>().AsNoTracking()
                .Where(r => r.RequestedByUserId == userId && r.Type == "ABSENCE")
                .OrderByDescending(r => r.CreatedAtUtc).Take(40)
                .Select(r => new { r.RequestId, r.SessionId, r.Type, r.Reason,
                    r.Status, r.CreatedAtUtc, r.ReviewedAtUtc, r.ReviewNote })
                .ToListAsync(cancellationToken);
            return JsonSerializer.Serialize(new {
                role = "Coach", generatedAtUtc = now,
                accessScope = new { role = "Coach", coachId = userId, classIds },
                coachSessions, teachingRecords, assignedSupportRequests = namedSupportRequests, supportStats, absenceRequests,
                supportStatusLabels = new { notStarted = "Not started", inProgress = "In progress", done = "Done", overdue = "Overdue (derived from SLA, not a separate workflow status)" },
                coachRequestCapabilities = "Coach can submit eligible absence requests from Schedule > selected session. Coach cannot create member-support requests in this inbox; Coach handles support requests assigned to them.",
                note = "Read-only, limited to this coach's assigned sessions and own teaching records."
            });
        }


        // Staff roles have UI navigation access, but must never receive Member-scoped data.
        var accountRole = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking().Where(u => u.UserId == userId)
            .Select(u => u.Role == null ? (UserRole?)null : u.Role.RoleName)
            .SingleOrDefaultAsync(cancellationToken);
        if (accountRole is UserRole.CenterManager or UserRole.Receptionist or UserRole.SystemAdministrator)
        {
            var roleName = accountRole.Value.ToString();
            return JsonSerializer.Serialize(new {
                role = roleName, generatedAtUtc = now,
                accessScope = new { role = roleName, userId },
                note = "Navigation knowledge only; no business records loaded for staff."
            });
        }
        if (accountRole != UserRole.Member)
            throw new SportHub.BuildingBlocks.SharedKernel.Errors.ForbiddenException("ai_chat_role_forbidden", "This account cannot use the assistant.");

        var member = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking()
            .Where(u => u.UserId == userId)
            .Select(u => new
            {
                name = u.Profile != null
                    ? u.Profile.FullName
                    : u.Email,

                email = u.Email
            })
            .SingleOrDefaultAsync(cancellationToken);

        var activeMemberPackages = await db.Set<MemberPackage>()
            .AsNoTracking()
            .Where(mp =>
                mp.MemberId == userId &&
                mp.Status == MemberPackageStatus.Active)
            .OrderBy(mp => mp.EndDate)
            .Select(mp => new
            {
                packageName = mp.Package != null
                    ? mp.Package.Name
                    : "Unknown",

                mp.StartDate,
                mp.EndDate,
                mp.RemainingSessions
            })
            .ToListAsync(cancellationToken);

        var packageCatalog = await db.Set<MembershipPackage>()
            .AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.Price)
            .Select(p => new
            {
                p.PackageId,
                p.Name,
                p.Price,
                p.DurationDays,
                p.SessionLimit,
                p.Description
            })
            .ToListAsync(cancellationToken);

        var currentEnrollments = MemberClassAccess.Current(db, userId, now);
        var healthProfile = await db.Set<MemberTrainingProfile>().AsNoTracking()
            .Where(p => p.MemberId == userId)
            .Select(p => new { p.Goal, p.GoalType, p.ExperienceLevel, p.HeightCm, p.WeightKg, p.BodyBuild,
                p.TargetWeightKg, p.ActivityLevel, p.TrainingDaysPerWeek, p.SessionMinutes, p.Notes,
                p.DietaryPreference, p.FoodAllergies, p.UpdatedAt }).SingleOrDefaultAsync(cancellationToken);
        var teachingQuery = (from r in db.Set<ClassTeachingRecord>().AsNoTracking()
                              join c in db.Set<Class>() on r.ClassId equals c.ClassId
                              join s in db.Set<ClassSession>() on r.SessionId equals s.SessionId into sessions
                              from s in sessions.DefaultIfEmpty()
                              where currentEnrollments.Any(e => e.ClassId == r.ClassId)
                                  && (r.MemberId == null || r.MemberId == userId)
                              orderby r.UpdatedAtUtc descending, r.RecordId
                              select new { r.RecordId, r.ClassId, ClassName = c.Name, r.SessionId,
                                  SessionStartAtUtc = s == null ? (DateTime?)null : s.StartAtUtc,
                                  r.MemberId, r.CoachId, r.Kind, r.Title, r.Content, r.Score, r.UpdatedAtUtc });
        var plans = await teachingQuery.Where(r => r.Kind == "PLAN")
            .OrderBy(r => r.SessionStartAtUtc >= now ? 0 : r.SessionId == null ? 1 : 2)
            .ThenBy(r => r.SessionStartAtUtc >= now ? r.SessionStartAtUtc : null)
            .ThenByDescending(r => r.UpdatedAtUtc).Take(12).ToListAsync(cancellationToken);
        var feedback = await teachingQuery.Where(r => r.Kind == "RESULT").Take(16).ToListAsync(cancellationToken);
        var otherTeaching = await teachingQuery.Where(r => r.Kind == "HOMEWORK" || r.Kind == "NOTICE")
            .Take(8).ToListAsync(cancellationToken);
        var teaching = plans.Concat(feedback).Concat(otherTeaching);
        // Bounded excerpts retain source IDs/dates so advice can cite the actual lesson or assessment.
        var memberTeaching = teaching.Select(r => new { r.RecordId, r.ClassId, r.ClassName, r.SessionId,
            r.SessionStartAtUtc, r.CoachId, r.Kind, r.Title,
            Content = r.Content.Length > 2000 ? r.Content[..2000] : r.Content, ContentTruncated = r.Content.Length > 2000, r.Score, r.UpdatedAtUtc });
        var attendance = await db.Set<Attendance>().AsNoTracking()
            .Where(a => a.Enrollment!.MemberId == userId)
            .GroupBy(a => a.Status).Select(g => new { Status = g.Key.ToString(), Count = g.Count() })
            .ToListAsync(cancellationToken);

        var upcomingSessions = await db.Set<ClassSession>()
            .AsNoTracking()
            .Where(s =>
                currentEnrollments.Any(e => e.ClassId == s.ClassId) &&
                s.StartAtUtc >= now &&
                s.StartAtUtc <= until &&
                s.Status == ClassSessionStatus.Scheduled)
            .OrderBy(s => s.StartAtUtc)
            .Take(MaxUpcomingSessions)
            .Select(s => new
            {
                s.SessionId,

                className = s.Class != null
                    ? s.Class.Name
                    : "Unknown",

                sport = s.Class != null && s.Class.Sport != null
                    ? s.Class.Sport.Name
                    : "Unknown",

                room = s.Room != null
                    ? s.Room.Name
                    : "Unknown",

                s.CoachId,

                s.StartAtUtc,
                s.EndAtUtc,
                capacity = s.Class != null ? s.Class.Capacity : 0,
                confirmedCount = s.Class != null ? s.Class.ConfirmedCount : 0,

                availableSeats = s.Class != null && s.Class.Capacity - s.Class.ReservedCount > 0
                    ? s.Class.Capacity - s.Class.ReservedCount
                    : 0,

                isMakeup = s.IsMakeup
            })
            .ToListAsync(cancellationToken);

        var accessScope = await currentEnrollments.OrderBy(e => e.ClassId).Select(e => new { e.ClassId, e.EnrollmentId }).ToListAsync(cancellationToken);
        // Additional Member data domains, all filtered by authenticated JWT user ID.
        // Bounded snapshots do not replace an authoritative paged query for complete history.
        var myEnrollments = await LoadOptionalAsync(db.Set<Enrollment>().AsNoTracking()
            .Where(e => e.MemberId == userId)
            .OrderByDescending(e => e.EnrolledAt).Take(60)
            .Select(e => new { e.EnrollmentId, e.ClassId,
                className = e.Class != null ? e.Class.Name : "Unknown",
                status = e.Status.ToString(), e.EnrolledAt, e.EndedAt })
            .ToListAsync(cancellationToken), "myEnrollments", cancellationToken);
        var myInvoices = await LoadOptionalAsync(db.Set<Invoice>().AsNoTracking()
            .Where(i => i.MemberId == userId)
            .OrderByDescending(i => i.IssuedAt).Take(50)
            .Select(i => new { i.InvoiceId, i.InvoiceNumber,
                status = i.Status.ToString(), i.TotalAmount, i.CashAmount,
                i.PointsApplied, i.IssuedAt, i.PaidAtUtc })
            .ToListAsync(cancellationToken), "myInvoices", cancellationToken);
        var myCourtRentals = await LoadOptionalAsync(db.Set<CourtRental>().AsNoTracking()
            .Where(r => r.MemberId == userId)
            .OrderByDescending(r => r.StartAtUtc).Take(40)
            .Select(r => new { r.CourtRentalId, r.SportId, r.RoomId,
                r.StartAtUtc, r.EndAtUtc, status = r.Status.ToString(), r.TotalPrice })
            .ToListAsync(cancellationToken), "myCourtRentals", cancellationToken);
        var myNotifications = await LoadOptionalAsync(db.Set<SportHub.Notification.Domain.Entities.Notification>().AsNoTracking()
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.SentAt).Take(30)
            .Select(n => new { n.NotificationId, n.Message,
                status = n.Status.ToString(), n.SentAt })
            .ToListAsync(cancellationToken), "myNotifications", cancellationToken);
        // Read-only Member records: NEVER expose requests owned by another Member.
        var mySupportRequests = await LoadOptionalAsync(db.Set<MemberSupportRequest>().AsNoTracking()
            .Where(r => r.MemberId == userId)
            .OrderByDescending(r => r.CreatedAt).Take(50)
            .Select(r => new { r.RequestId, r.Category, r.Subject,
                r.Status, r.CreatedAt, r.UpdatedAt, r.SlaDueAtUtc })
            .ToListAsync(cancellationToken), "mySupportRequests", cancellationToken);
        // Additional owner-scoped Member data from EF Core. Failures are tracked as unavailable.
        var expandedMemberData = await LoadOptionalAsync(
            AiMemberExtendedData.LoadAsync(db, userId, question, cancellationToken),
            "expandedMemberData", cancellationToken);
        var memberApiKnowledge = AiMemberApiKnowledge.ForQuestion(question);
        var context = new
        {
            role = "Member",
            expandedMemberData, memberApiKnowledge,
            generatedAtUtc = now,
            accessScope,
            mySupportRequests, myEnrollments, myInvoices, myCourtRentals, myNotifications,
            unavailableDomains = new[] {
                mySupportRequests is null ? "mySupportRequests" : null,
                myEnrollments is null ? "myEnrollments" : null,
                myInvoices is null ? "myInvoices" : null,
                myCourtRentals is null ? "myCourtRentals" : null,
                myNotifications is null ? "myNotifications" : null
            }.Where(x => x is not null).ToArray(),

            contextWindow = new
            {
                upcomingClassesFromUtc = now,
                upcomingClassesToUtc = until,
                maxSessionsReturned = MaxUpcomingSessions,
                maxPlans = 12, maxAssessments = 16, maxNoticesAndHomework = 8, maxExcerptCharacters = 2000
            },

            member = member is null
                ? null
                : new
                {
                    member.name,
                    member.email,
                    activePackages = activeMemberPackages
                },

            healthProfile,
            memberTeaching,
            attendance,
            activeMembershipCatalog = packageCatalog,

            upcomingClassSessions = upcomingSessions,

            note =
                "This is a read-only snapshot. Absence from this context means the assistant must not invent the value."
        };

        return JsonSerializer.Serialize(context);
    }
    // Optional read-only snapshots must not disable the whole chatbot if a table or
    // projection is unavailable in this deployment. Null means unavailable, not empty.
    private async Task<T?> LoadOptionalAsync<T>(Task<T> query, string domain,
        CancellationToken cancellationToken) where T : class
    {
        try { return await query; }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            logger.LogError(ex, "AI Member context read failed for {Domain}; optional data omitted", domain);
            return null;
        }
    }

}