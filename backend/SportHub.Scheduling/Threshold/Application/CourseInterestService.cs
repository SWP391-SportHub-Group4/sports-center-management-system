using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Application;

public sealed class CourseInterestService(ISportHubDbContext db, INotificationWriter notices, IUserAccessReader users, IClock clock, IConfiguration configuration)
{
    public async Task<object> ListAsync(Guid? memberId, CancellationToken ct)
    {
        var interests = await (from i in db.Set<CourseInterest>().AsNoTracking()
                               join c in db.Set<Class>() on i.SourceClassId equals c.ClassId
                               join u in db.Set<SportHub.Identity.Domain.Entities.UserAccount>() on i.MemberId equals u.UserId
                               where memberId == null || i.MemberId == memberId
                               orderby i.CreatedAtUtc descending
                               select new { i.InterestId, i.MemberId, MemberName = u.Profile != null ? u.Profile.FullName : u.Email, i.SourceClassId, SourceClassName = c.Name,
                                   c.SportId, SportName = c.Sport!.Name, i.RefundedPoints, i.Active, i.CreatedAtUtc, i.CancelledAtUtc })
            .Take(200).ToListAsync(ct);
        var ids = interests.Select(i => i.InterestId).ToArray();
        var deliveries = await (from d in db.Set<CourseInterestDelivery>().AsNoTracking()
                                join c in db.Set<Class>() on d.ClassId equals c.ClassId
                                where ids.Contains(d.InterestId)
                                orderby d.QueuedAtUtc descending
                                select new { d.InterestId, d.ClassId, ClassName = c.Name, d.QueuedAtUtc }).ToListAsync(ct);
        return interests.Select(i => new { i.InterestId, i.MemberId, i.MemberName, i.SourceClassId, i.SourceClassName,
            i.SportId, i.SportName, i.RefundedPoints, i.Active, i.CreatedAtUtc, i.CancelledAtUtc,
            Notifications = deliveries.Where(d => d.InterestId == i.InterestId).ToArray() }).ToArray();
    }

    public async Task CancelAsync(Guid id, Guid memberId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Shares the worker lock: once cancellation returns, no worker can queue another delivery.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 22)", ct);
        var interest = await db.Set<CourseInterest>().SingleOrDefaultAsync(i => i.InterestId == id && i.MemberId == memberId, ct)
            ?? throw new NotFoundException("course_interest_not_found", "Course interest not found.");
        if (interest.Active) { interest.Active = false; interest.CancelledAtUtc = clock.UtcNow; }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task NotifyOpenClassesAsync(CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 22)", ct);
        var now = clock.UtcNow;
        var pending = await (from i in db.Set<CourseInterest>()
                             join c in db.Set<Class>() on i.SportId equals c.SportId
                             where i.Active && c.ClassId != i.SourceClassId
                                 && (c.PublishedAtUtc >= i.CreatedAtUtc
                                     || c.PublishedAtUtc == null && c.ContinuationOfClassId == i.SourceClassId)
                                 && !db.Set<SportHub.Scheduling.Domain.Entities.Enrollment>().Any(e => e.MemberId == i.MemberId
                                     && e.ClassId == c.ClassId && e.Status == SportHub.Scheduling.Domain.Enums.EnrollmentStatus.Confirmed && e.EndedAt == null)
                                 && c.Status == ClassStatus.Published && c.EnrollmentOpen
                                 && c.ReservedCount < c.Capacity
                                 && c.Sessions.Any() && !c.Sessions.Any(s => s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc <= now)
                                 && c.Sessions.Any(s => s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc > now)
                                 && !db.Set<CourseInterestDelivery>().Any(d => d.InterestId == i.InterestId && d.ClassId == c.ClassId)
                             select new { i.InterestId, i.MemberId, c.ClassId, c.Name }).ToListAsync(ct);
        foreach (var p in pending)
        {
            var user = await users.GetAsync(p.MemberId, ct);
            if (user is not { IsActive: true, Role: "Member" }) continue;
            var delivery = new CourseInterestDelivery { DeliveryId = Guid.NewGuid(), InterestId = p.InterestId,
                ClassId = p.ClassId, QueuedAtUtc = now };
            db.Set<CourseInterestDelivery>().Add(delivery);
            var message = $"The next class, {p.Name}, is now open for registration. View the class to check availability. No seat has been reserved.";
            notices.Queue(new NotificationRequest(p.MemberId, NotificationEvents.NextCourseAvailable, message, delivery.DeliveryId));
            var configuredBase = configuration["Frontend:BaseUrl"] ?? "http://localhost:3000";
            var classLink = Uri.TryCreate(configuredBase, UriKind.Absolute, out var baseUri)
                && (baseUri.Scheme == "https" || baseUri.Scheme == "http")
                ? $"<p><a href=\"{WebUtility.HtmlEncode(new Uri(baseUri, $"/member/services?view=explore&course={p.ClassId}").AbsoluteUri)}\">View class</a></p>" : "";
            notices.QueueEmail(new EmailNotificationRequest(p.MemberId, user.Email, NotificationEvents.NextCourseAvailable,
                delivery.DeliveryId, "Your next class is open", $"<p>{WebUtility.HtmlEncode(message)}</p>{classLink}<p>Sign in to SportHub to register.</p>"));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
