using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Wallet;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Infrastructure;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.API.Persistence;

/// <summary>
/// Dữ liệu demo cho Flow 1 (User &amp; Membership) và Flow 2 (Class booking &amp; schedule). Chạy bằng lệnh riêng
/// (<c>dotnet run --project backend/SportHub.API -- --seed-demo-flow12=true</c>), không chạy khi khởi động.
///
/// - Ba Member demo (<c>demo.member1..3@sporthub.vn</c>, mật khẩu <see cref="DemoDataSeeder.DemoPassword"/>) mỗi người có ví
///   <see cref="WalletPoints"/> điểm để thanh toán bằng điểm khi demo (không cần VNPay).
///   Member 1 có Membership Gym đang hoạt động (Hào check-in được ngay); Member 2 và 3 chưa có gói (demo mua gói).
/// - Lớp <c>DEMO-SMALL-01</c> chỉ 2 chỗ để demo không bán vượt sĩ số: Member 2 và 3 đăng ký, người thứ ba bị từ chối.
/// - Chạy lại không nhân bản tài khoản, gói hay lớp; ví chỉ được cộng một lần nhờ tham chiếu cố định.
/// - Bốn lớp BR-141 được bảo đảm có sẵn (gọi <see cref="Br141DemoSeeder"/> trước, cũng idempotent).
/// </summary>
public sealed class DemoFlow12Seeder(
    SportHubDbContext db,
    Br141DemoSeeder br141,
    IClassService classes,
    IPasswordHasher passwordHasher,
    IInvoiceNumberGenerator invoiceNumbers,
    IPointWalletService wallets,
    IClock clock,
    ILogger<DemoFlow12Seeder> logger)
{
    public const int WalletPoints = 3_000;
    private const string SmallClassCode = "DEMO-SMALL-01";

    private sealed record DemoMember(string Email, string FullName, string Phone, Guid WalletReference, bool HasGymPackage);

    private static readonly DemoMember[] Members =
    [
        new("demo.member1@sporthub.vn", "Demo Member 1 (có gói Gym)", "0911000001", Guid.Parse("0d6f9b1e-5b7a-4c53-a1f1-2f0a7b9c0001"), true),
        new("demo.member2@sporthub.vn", "Demo Member 2 (mua gói, hết chỗ)", "0911000002", Guid.Parse("0d6f9b1e-5b7a-4c53-a1f1-2f0a7b9c0002"), false),
        new("demo.member3@sporthub.vn", "Demo Member 3 (hết chỗ)", "0911000003", Guid.Parse("0d6f9b1e-5b7a-4c53-a1f1-2f0a7b9c0003"), false),
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        await br141.SeedAsync(ct);

        var manager = await db.UserAccounts.Where(u => u.Role!.RoleName == UserRole.CenterManager && u.Status == UserStatus.Active)
                          .OrderBy(u => u.CreatedAt).FirstOrDefaultAsync(ct)
                      ?? throw new InvalidOperationException("Chưa có Center Manager đang hoạt động.");
        var reception = await db.UserAccounts.Where(u => u.Role!.RoleName == UserRole.Receptionist && u.Status == UserStatus.Active)
                            .OrderBy(u => u.CreatedAt).FirstOrDefaultAsync(ct)
                        ?? throw new InvalidOperationException("Chưa có Receptionist đang hoạt động.");

        var memberRole = await db.Roles.SingleAsync(r => r.RoleName == UserRole.Member, ct);
        var package = await db.Set<MembershipPackage>().OrderBy(p => p.PackageId).FirstOrDefaultAsync(ct)
                      ?? throw new InvalidOperationException("Chưa có gói Membership nào (chạy migration/seed hệ thống trước).");

        foreach (var demo in Members)
        {
            var member = await EnsureMemberAsync(demo, memberRole.RoleId, ct);
            await EnsureWalletAsync(member, demo, manager.UserId, ct);
            if (demo.HasGymPackage) await EnsureGymPackageAsync(member, package, reception.UserId, ct);
        }

        await EnsureSmallClassAsync(manager.UserId, ct);
    }

    private async Task<UserAccount> EnsureMemberAsync(DemoMember demo, int roleId, CancellationToken ct)
    {
        var existing = await db.UserAccounts.SingleOrDefaultAsync(u => u.Email == demo.Email, ct);
        if (existing is not null) return existing;

        var phone = demo.Phone;
        while (await db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, ct))
            phone = "09" + Random.Shared.NextInt64(10_000_000, 99_999_999);

        var user = new UserAccount
        {
            UserId = Guid.NewGuid(),
            Email = demo.Email,
            RoleId = roleId,
            Status = UserStatus.Active,
            CreatedAt = clock.UtcNow,
            Credential = new UserCredential { PasswordHash = passwordHasher.Hash(DemoDataSeeder.DemoPassword) },
            Profile = new UserProfile { FullName = demo.FullName, Phone = phone }
        };
        db.UserAccounts.Add(user);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Đã tạo Member demo {Email}.", demo.Email);
        return user;
    }

    private async Task EnsureWalletAsync(UserAccount member, DemoMember demo, Guid actorId, CancellationToken ct)
    {
        // Tham chiếu cố định nên chạy lại không cộng điểm lần hai (ví idempotent theo ReferenceType + ReferenceId).
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await wallets.AdjustAsync(new WalletAdjustment(member.UserId, WalletPoints, WalletAdjustmentDirection.Credit,
            "DemoFlow12Balance", demo.WalletReference, actorId, "Demo opening balance for Flow 1/2"), ct);
        await tx.CommitAsync(ct);
    }

    private async Task EnsureGymPackageAsync(UserAccount member, MembershipPackage package, Guid receptionId, CancellationToken ct)
    {
        if (await db.MemberPackages.AnyAsync(mp => mp.MemberId == member.UserId, ct)) return;

        var today = VietnamTime.TodayLocal(clock);
        var issuedAt = clock.UtcNow;
        var memberPackage = new MemberPackage
        {
            MemberPackageId = Guid.NewGuid(),
            MemberId = member.UserId,
            PackageId = package.PackageId,
            StartDate = today,
            EndDate = today.AddDays(package.DurationDays - 1),
            RemainingSessions = package.SessionLimit,
            Status = MemberPackageStatus.Active
        };
        db.MemberPackages.Add(memberPackage);

        var invoice = new Invoice
        {
            InvoiceId = Guid.NewGuid(),
            InvoiceNumber = await invoiceNumbers.NextAsync(issuedAt, ct),
            MemberId = member.UserId,
            IssuedByUserId = receptionId,
            MemberPackageId = memberPackage.MemberPackageId,
            TotalAmount = package.Price,
            CashAmount = package.Price,
            Status = InvoiceStatus.Paid,
            PaidVia = "Cash",
            PaidAtUtc = issuedAt,
            IssuedAt = issuedAt
        };
        db.Invoices.Add(invoice);

        var item = new InvoiceItem
        {
            ItemId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            ItemType = InvoiceItemType.Membership,
            Description = $"Package {package.Name} ({package.DurationDays} days)",
            UnitPrice = package.Price,
            Quantity = 1,
            LineAmount = package.Price,
            RelatedEntityId = memberPackage.MemberPackageId
        };
        db.InvoiceItems.Add(item);
        await db.SaveChangesAsync(ct);

        memberPackage.InvoiceItemId = item.ItemId;
        db.Payments.Add(new Payment.Domain.Entities.Payment
        {
            PaymentId = Guid.NewGuid(),
            InvoiceId = invoice.InvoiceId,
            Amount = package.Price,
            Method = PaymentMethod.Cash,
            Status = PaymentStatus.Success,
            ReceivedByUserId = receptionId,
            PaidAt = issuedAt
        });
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Đã cấp gói {Package} đang hoạt động cho {Email}.", package.Name, member.Email);
    }

    /// <summary>Lớp 3 buổi, 2 chỗ: Thứ 2-4-6 10:00 sân KC1 của Bóng rổ (BR-141 chiếm 07:00-09:00 nên không trùng), Coach Bóng rổ.</summary>
    private async Task EnsureSmallClassAsync(Guid managerId, CancellationToken ct)
    {
        if (await db.Set<Class>().AnyAsync(c => c.Code == SmallClassCode, ct))
        {
            logger.LogInformation("Bỏ qua {Code}: đã có.", SmallClassCode);
            return;
        }

        var sport = await db.Set<Sport>().SingleAsync(s => s.Code == "basketball", ct);
        var coach = await db.UserAccounts.SingleAsync(u => u.Email == "coach.bongro@sporthub.vn", ct);
        var room = await db.Rooms.SingleAsync(r => r.Name == "Basketball Class KC1", ct);

        // Thứ Hai kế tiếp cách ít nhất 8 ngày để hạn xét ngưỡng còn ở tương lai.
        var start = VietnamTime.TodayLocal(clock).AddDays(8);
        while (start.DayOfWeek != DayOfWeek.Monday) start = start.AddDays(1);

        var created = await classes.CreateAsync(new SaveClassRequest
        {
            Code = SmallClassCode,
            Name = "Bóng rổ nhỏ (demo hết chỗ)",
            SportId = sport.SportId,
            CoachId = coach.UserId,
            DefaultRoomId = room.RoomId,
            StartDate = start,
            NumSessions = 3,
            Capacity = 2,
            Price = 100_000m,
            CostAmount = 100_000m,
            ScheduleRules = new[] { DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday }
                .Select(d => new ScheduleRuleInput { DayOfWeek = (int)d, StartTimeLocal = "10:00" }).ToList()
        }, managerId, ct);

        await classes.PublishAsync(created.ClassId, new PublishClassRequest { ExpectedVersion = created.Version }, managerId, ct);
        logger.LogInformation("Đã tạo và publish {Code} (2 chỗ).", SmallClassCode);
    }
}
