using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Exceptions;

namespace SportHub.Identity.Infrastructure.Repositories;

public sealed class UserAccountRepository(ISportHubDbContext db) : IUserAccountRepository
{
    public Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken = default)
        => db.Set<UserAccount>().AnyAsync(u => u.Email == email, cancellationToken);

    public Task<bool> PhoneExistsAsync(string phone, CancellationToken cancellationToken = default)
        => db.Set<UserProfile>().AnyAsync(p => p.Phone == phone, cancellationToken);

    public Task<Role> GetRoleAsync(UserRole roleName, CancellationToken cancellationToken = default)
        => db.Set<Role>().SingleAsync(r => r.RoleName == roleName, cancellationToken);

    // Include đủ 3 navigation ngay từ đây: DbContext không bật lazy loading proxy, nên
    // thiếu Include(Profile) thì user.Profile luôn null ở AuthService và response trả
    // fullName = "" cho MỌI user — bug im lặng, không throw gì.
    // SingleOrDefault (không phải FirstOrDefault): email unique (BR-49), >1 dòng là dữ liệu hỏng.
    public Task<UserAccount?> FindByEmailForLoginAsync(string email, CancellationToken cancellationToken = default)
        => db.Set<UserAccount>()
            .Include(u => u.Credential)
            .Include(u => u.Role)
            .Include(u => u.Profile)
            .SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

    public async Task AddAndSaveAsync(UserAccount account, CancellationToken cancellationToken = default)
    {
        db.Set<UserAccount>().Add(account);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "ix_user_accounts_email"
            })
        {
            throw new EmailAlreadyExistsException();
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "ix_user_profiles_phone"
            })
        {
            throw new PhoneAlreadyExistsException();
        }
    }
}
