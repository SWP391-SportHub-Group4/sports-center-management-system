using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Occupancy.Domain;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Scheduling.Threshold.Domain;
using SportHub.Training.Domain.Enums;

namespace SportHub.API.Persistence;

public sealed partial class DemoDataSeeder
{
    /// <summary>Explicit local Development fixtures. Re-running on the same Vietnam date is a no-op.</summary>
    public async Task SeedCoachTeachingAsync(CancellationToken ct = default)
    {
        var today = VietnamTime.TodayLocal(clock);
        var now = clock.UtcNow;
        var prefix = $"DEMO-TEACHING-{today:yyyyMMdd}";
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(731041010)", ct);
        var manager = await db.UserAccounts.Include(x => x.Role)
            .SingleOrDefaultAsync(x => x.Email == "manager@sporthub.vn", ct);
        if (manager is not { Status: UserStatus.Active, Role.RoleName: UserRole.CenterManager })
            throw new InvalidOperationException("Active demo manager manager@sporthub.vn is required. Seed the base demo dataset first.");

        var accounts = new[] {
            ("an.member@sporthub.vn", "Hồ Lê Thiên An", "0903000001"),
            ("binh.member@sporthub.vn", "Nguyễn Thanh Bình", "0903000002"),
            ("chi.member@sporthub.vn", "Lý Bảo Chi", "0903000003"),
            ("dung.member@sporthub.vn", "Trịnh Tiến Dũng", "0903000004"),
            ("giang.member@sporthub.vn", "Mai Hương Giang", "0903000005"),
            ("linh.demo@sporthub.vn", "Nguyễn Khánh Linh", "0903990010")
        };
        var members = new List<UserAccount>();
        var memberRole = await db.Roles.SingleAsync(x => x.RoleName == UserRole.Member, ct);
        foreach (var (email, name, phone) in accounts)
        {
            var member = await db.UserAccounts.Include(x => x.Role).SingleOrDefaultAsync(x => x.Email == email, ct);
            if (member == null)
            {
                member = NewUser(email, name, await EnsureUniqueDemoPhoneAsync(phone, 8, ct), UserRole.Member);
                member.RoleId = memberRole.RoleId;
                db.UserAccounts.Add(member);
                await db.SaveChangesAsync(ct);
            }
            if (member.Status != UserStatus.Active || member.RoleId != memberRole.RoleId)
                throw new InvalidOperationException($"Demo account {email} must be an active Member; existing account was not changed.");
            members.Add(member);
        }

        var created = 0;
        foreach (var sportId in new[] { 3, 4 })
        {
            var badminton = sportId == 3;
            var label = badminton ? "Cầu lông" : "Bóng rổ";
            var coach = await EnsureDemoCoachAsync(badminton ? "coach.caulong@sporthub.vn" : "coach.bongro@sporthub.vn",
                badminton ? "Phạm Minh Cầu Lông" : "Vũ Hải Bóng Rổ", badminton ? "0902000001" : "0902000002", sportId, ct)
                ?? throw new InvalidOperationException($"Active demo coach for {label} is unavailable.");
            var room = await EnsureDemoRoomAsync($"Demo Teaching · {label}", sportId, 12, ct)
                ?? throw new InvalidOperationException($"Demo room for {label} is unavailable.");
            var cohort = members.Skip(badminton ? 0 : 3).Take(3).ToArray();
            for (var i = 0; i < cohort.Length; i++)
            {
                if (await db.MemberTrainingProfiles.AnyAsync(x => x.MemberId == cohort[i].UserId, ct)) continue;
                db.MemberTrainingProfiles.Add(new MemberTrainingProfile {
                    ProfileId = Guid.NewGuid(), MemberId = cohort[i].UserId,
                    Goal = badminton ? "Cải thiện giao cầu, di chuyển và phối hợp đánh đôi" : "Nâng cao dẫn bóng, ném rổ và phối hợp đồng đội",
                    ExperienceLevel = i == 0 ? ExperienceLevel.Beginner : ExperienceLevel.Intermediate,
                    Notes = "Hồ sơ luyện tập demo · ưu tiên kỹ thuật và tăng cường độ từng bước.", UpdatedAt = now
                });
            }
            await db.SaveChangesAsync(ct);

            for (var track = 0; track < 2; track++)
            {
                var code = $"{prefix}-{sportId}-{track}";
                if (await db.Classes.AnyAsync(x => x.Code == code, ct)) continue;
                var slots = new List<(DateTime start, DateTime end)>();
                foreach (var offset in new[] { -4, -2, 0, 2, 4, 7 })
                {
                    var slot = await FindTeachingDemoSlotAsync(today.AddDays(offset), track == 0 ? 18 : 14,
                        coach.UserId, room.RoomId, cohort.Select(x => x.UserId).ToArray(), ct);
                    slots.Add(slot);
                }
                var course = new Class {
                    Code = code, Name = $"{label} · {(track == 0 ? "Nền tảng kỹ thuật" : "Phối hợp & thi đấu")} · Demo",
                    SportId = sportId, CoachId = coach.UserId, DefaultRoomId = room.RoomId,
                    StartDate = DateOnly.FromDateTime(VietnamTime.ToLocal(slots[0].start)), NumSessions = slots.Count,
                    Capacity = 12, Price = 600_000m, CostAmount = 1_200_000m, BreakEvenThreshold = 2,
                    ConfirmedCount = cohort.Length, ReservedCount = cohort.Length,
                    Status = ClassStatus.InProgress, ThresholdStatus = ThresholdStatus.Met,
                    ThresholdDeadlineUtc = slots[0].start.AddDays(-3), CreatedAt = slots[0].start.AddDays(-14),
                    PublishedAt = slots[0].start.AddDays(-10), Version = 1
                };
                db.Classes.Add(course);
                await db.SaveChangesAsync(ct);
                var sessions = slots.Select((slot, i) => new ClassSession {
                    SessionId = Guid.NewGuid(), ClassId = course.ClassId, SessionNo = i + 1,
                    RoomId = room.RoomId, CoachId = coach.UserId, StartAtUtc = slot.start, EndAtUtc = slot.end,
                    Status = slot.end <= now ? ClassSessionStatus.Completed : ClassSessionStatus.Scheduled
                }).ToArray();
                db.ClassSessions.AddRange(sessions);
                db.RoomOccupancies.AddRange(sessions.Select(s => new RoomOccupancy {
                    OccupancyId = Guid.NewGuid(), RoomId = room.RoomId, SourceType = OccupancySourceType.ClassSession,
                    SourceId = s.SessionId, StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
                }));
                db.CoachOccupancies.AddRange(sessions.Select(s => new CoachOccupancy {
                    OccupancyId = Guid.NewGuid(), CoachId = coach.UserId, SourceType = OccupancySourceType.ClassSession,
                    SourceId = s.SessionId, StartAtUtc = s.StartAtUtc, EndAtUtc = s.EndAtUtc, IsActive = true
                }));
                await db.SaveChangesAsync(ct);
                var enrollments = new List<Enrollment>();
                foreach (var student in cohort)
                {
                    var enrolledAt = slots[0].start.AddDays(-7);
                    var holdId = Guid.NewGuid();
                    var item = await AddCalendarDemoInvoiceAsync(student.UserId, manager.UserId, course.Price,
                        InvoiceItemType.ClassPackage, holdId, $"Teaching demo legacy fixture · {code}", enrolledAt, ct);
                    db.Set<SeatHold>().Add(new SeatHold {
                        HoldId = holdId, ClassId = course.ClassId, MemberId = student.UserId,
                        InvoiceId = item.InvoiceId, Status = SeatHoldStatus.Converted, CreatedAt = enrolledAt, ExpiresAtUtc = enrolledAt
                    });
                    var enrollment = new Enrollment {
                        EnrollmentId = Guid.NewGuid(), ClassId = course.ClassId, MemberId = student.UserId,
                        InvoiceItemId = item.ItemId, Status = EnrollmentStatus.Confirmed, EnrolledAt = enrolledAt
                    };
                    db.Enrollments.Add(enrollment);
                    enrollments.Add(enrollment);
                }
                await db.SaveChangesAsync(ct);

                void AddRecord(string kind, string title, string content, DateTime at, Guid? sessionId = null,
                    Guid? memberId = null, int? score = null, DateTime? due = null) => db.Set<ClassTeachingRecord>().Add(new() {
                        RecordId = Guid.NewGuid(), ClassId = course.ClassId, CoachId = coach.UserId, Kind = kind,
                        Title = title, Content = content, SessionId = sessionId, MemberId = memberId, Score = score,
                        DueAtUtc = due, CreatedAtUtc = at, UpdatedAtUtc = at, Version = 1
                    });
                AddRecord("PLAN", "Lộ trình kỹ thuật và phối hợp", badminton
                    ? "Mục tiêu: tư thế cầm vợt, giao cầu ngắn, di chuyển 6 điểm và phối hợp đánh đôi.\nMỗi buổi có khởi động, kỹ thuật cơ bản, bài tập phối hợp và giãn cơ. Điều chỉnh độ khó theo từng học viên."
                    : "Mục tiêu: dẫn bóng hai tay, chuyền bóng chính xác, ném rổ và phối hợp 3 đấu 3.\nMỗi buổi có khởi động, bài tập kỹ thuật, tình huống thi đấu và thả lỏng. Theo dõi độ chính xác qua từng buổi.", slots[0].start.AddDays(-1));
                foreach (var session in sessions)
                {
                    AddRecord("PLAN", $"Buổi {session.SessionNo} · {(badminton ? "Kiểm soát cầu & di chuyển" : "Dẫn bóng & phối hợp")}", badminton
                        ? "Khởi động · 10 phút\nDi chuyển 6 điểm trên sân · 15 phút\nGiao cầu và đỡ cầu theo cặp · 25 phút\nĐánh đôi, đổi vị trí sau mỗi lượt · 30 phút\nGiãn cơ và nhận xét · 10 phút"
                        : "Khởi động với bóng · 10 phút\nDẫn bóng đổi hướng · 15 phút\nChuyền bóng và di chuyển không bóng · 25 phút\nTình huống 3 đấu 3 · 30 phút\nThả lỏng và nhận xét · 10 phút", session.StartAtUtc.AddHours(-12) < now ? session.StartAtUtc.AddHours(-12) : now, session.SessionId);
                    if (session.EndAtUtc > now) continue;
                    for (var i = 0; i < enrollments.Count; i++)
                    {
                        var absent = session.SessionNo == 2 && i == 2;
                        db.Attendances.Add(new Attendance {
                            AttendanceId = Guid.NewGuid(), EnrollmentId = enrollments[i].EnrollmentId,
                            SessionId = session.SessionId, Status = absent ? AttendanceStatus.Absent : AttendanceStatus.Present,
                            RecordedByUserId = coach.UserId, RecordedAt = session.StartAtUtc.AddMinutes(5)
                        });
                        if (!absent) AddRecord("RESULT", $"Buổi {session.SessionNo} · Tiến bộ kỹ thuật", badminton
                            ? "Đã ổn định tư thế cầm vợt và giao cầu. Di chuyển về vị trí trung tâm tốt hơn. Buổi tới chú ý bước chân cuối và giữ khoảng cách khi đánh đôi."
                            : "Dẫn bóng bằng tay không thuận tốt hơn, chuyền bóng đúng vị trí. Cần quan sát đồng đội trước khi ném rổ. Buổi tới tăng bài tập đổi hướng và phối hợp.",
                            session.EndAtUtc.AddMinutes(5) <= now ? session.EndAtUtc.AddMinutes(5) : now,
                            session.SessionId, enrollments[i].MemberId, Math.Min(5, 2 + session.SessionNo + i % 2));
                    }
                }
                AddRecord("PLAN", "Kế hoạch cá nhân · Củng cố kỹ thuật", "Dành 10 phút mỗi ngày cho bài tập kỹ thuật cơ bản. Ưu tiên độ chính xác trước tốc độ. Coach sẽ đánh giá lại trong buổi học tiếp theo.", now, memberId: cohort[0].UserId);
                var previous = sessions.LastOrDefault(s => s.EndAtUtc <= now);
                AddRecord("HOMEWORK", "Bài tập trước buổi học tiếp theo", badminton
                    ? "Tập bước chân 6 điểm: 3 hiệp × 60 giây, nghỉ 45 giây. Tập động tác giao cầu không dùng cầu: 20 lần. Ghi lại phần khó nhất để trao đổi với coach."
                    : "Dẫn bóng tại chỗ bằng từng tay: 3 hiệp × 60 giây. Tập tư thế ném rổ: 20 lần. Ghi lại số lần thực hiện đúng và trao đổi trong buổi sau.",
                    now, previous?.SessionId, due: VietnamTime.StartOfDayUtc(today.AddDays(5)).AddHours(20));
                AddRecord("NOTICE", "Chuẩn bị cho buổi học tiếp theo", "Có mặt trước giờ học 10 phút. Mang nước uống, khăn và giày thể thao phù hợp. Nếu không thể tham gia, báo coach trước buổi học.", now);
                await db.SaveChangesAsync(ct);
                created++;
            }
        }
        await tx.CommitAsync(ct);
        logger.LogInformation("Coach teaching demo ready ({Prefix}): {Created} new classes. Demo coaches: coach.caulong@sporthub.vn, coach.bongro@sporthub.vn.", prefix, created);
    }

    private async Task<(DateTime start, DateTime end)> FindTeachingDemoSlotAsync(DateOnly day, int preferredHour,
        Guid coachId, int roomId, Guid[] members, CancellationToken ct)
    {
        foreach (var hour in new[] { preferredHour, 8, 10, 12, 14, 16, 18, 20 }.Distinct())
        {
            var start = VietnamTime.StartOfDayUtc(day).AddHours(hour);
            var end = start.AddMinutes(90);
            if (await db.RoomOccupancies.AnyAsync(x => x.IsActive && x.RoomId == roomId && x.StartAtUtc < end && x.EndAtUtc > start, ct)
                || await db.CoachOccupancies.AnyAsync(x => x.IsActive && x.CoachId == coachId && x.StartAtUtc < end && x.EndAtUtc > start, ct)
                || await db.ClassSessions.AnyAsync(s => s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc < end && s.EndAtUtc > start && db.Enrollments.Any(e => e.ClassId == s.ClassId && members.Contains(e.MemberId) && e.Status == EnrollmentStatus.Confirmed), ct)
                || await db.PtSessions.AnyAsync(s => members.Contains(s.MemberId) && (s.Status == PtSessionStatus.Scheduled || s.Status == PtSessionStatus.PendingPayment || s.Status == PtSessionStatus.Completed) && s.StartAtUtc < end && s.EndAtUtc > start, ct)
                || await db.Set<CourtRental>().AnyAsync(r => members.Contains(r.MemberId) && (r.Status == CourtRentalStatus.Confirmed || r.Status == CourtRentalStatus.PendingPayment) && r.StartAtUtc < end && r.EndAtUtc > start, ct)) continue;
            return (start, end);
        }
        throw new InvalidOperationException($"No free demo teaching slot on {day:yyyy-MM-dd}; nothing was committed.");
    }
}
