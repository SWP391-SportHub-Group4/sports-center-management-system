using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.Identity.Application.Services;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Bo dem dung chung cho ca host test (singleton). Cho phep khang dinh
/// "request bi 429 khong cham repository/hasher" va "token thieu user id khong query DB".
/// </summary>
public sealed class CallSpy
{
    private int _isActiveCalls;
    private int _findByEmailCalls;
    private int _verifyCalls;
    private int _verifyDummyCalls;

    public int IsActiveCalls => Volatile.Read(ref _isActiveCalls);

    public int FindByEmailCalls => Volatile.Read(ref _findByEmailCalls);

    public int VerifyCalls => Volatile.Read(ref _verifyCalls);

    public int VerifyDummyCalls => Volatile.Read(ref _verifyDummyCalls);

    /// <summary>Bat che do gia lap loi DB de kiem tra huong fail-closed.</summary>
    public bool ThrowOnIsActive { get; set; }

    public void RecordIsActive() => Interlocked.Increment(ref _isActiveCalls);

    public void RecordFindByEmail() => Interlocked.Increment(ref _findByEmailCalls);

    public void RecordVerify() => Interlocked.Increment(ref _verifyCalls);

    public void RecordVerifyDummy() => Interlocked.Increment(ref _verifyDummyCalls);

    public void Reset()
    {
        Interlocked.Exchange(ref _isActiveCalls, 0);
        Interlocked.Exchange(ref _findByEmailCalls, 0);
        Interlocked.Exchange(ref _verifyCalls, 0);
        Interlocked.Exchange(ref _verifyDummyCalls, 0);
        ThrowOnIsActive = false;
    }
}

/// <summary>
/// Decorator quanh repository that — van dung PostgreSQL that, chi them dem va
/// tuy chon nem loi de test fail-closed.
/// </summary>
public sealed class SpyUserAccountRepository(IUserAccountRepository inner, CallSpy spy) : IUserAccountRepository
{
    public Task<bool> IsActiveAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        spy.RecordIsActive();

        if (spy.ThrowOnIsActive)
        {
            throw new InvalidOperationException("Simulated database failure");
        }

        return inner.IsActiveAsync(userId, cancellationToken);
    }

    public Task<UserAccount?> FindByEmailForLoginAsync(string email, CancellationToken cancellationToken = default)
    {
        spy.RecordFindByEmail();
        return inner.FindByEmailForLoginAsync(email, cancellationToken);
    }

    public Task<bool> EmailExistsAsync(string email, CancellationToken cancellationToken = default)
        => inner.EmailExistsAsync(email, cancellationToken);

    public Task<bool> PhoneExistsAsync(string phone, CancellationToken cancellationToken = default)
        => inner.PhoneExistsAsync(phone, cancellationToken);

    public Task<Role> GetRoleAsync(UserRole roleName, CancellationToken cancellationToken = default)
        => inner.GetRoleAsync(roleName, cancellationToken);

    public Task AddAndSaveAsync(UserAccount account, CancellationToken cancellationToken = default)
        => inner.AddAndSaveAsync(account, cancellationToken);
}

public sealed class SpyPasswordHasher(IPasswordHasher inner, CallSpy spy) : IPasswordHasher
{
    public string Hash(string password) => inner.Hash(password);

    public bool Verify(string password, string hash)
    {
        spy.RecordVerify();
        return inner.Verify(password, hash);
    }

    public void VerifyDummy(string password)
    {
        spy.RecordVerifyDummy();
        inner.VerifyDummy(password);
    }
}

/// <summary>
/// Thay IEmailSender trong host test: giu lai email thay vi gui that, de test lay duoc ma OTP
/// va kiem tra "khong gui email" o cac nhanh bi chan.
/// </summary>
public sealed class CapturingEmailSender : IEmailSender
{
    private static readonly Regex OtpPattern = new(@">(\d{6})<", RegexOptions.Compiled);

    public ConcurrentQueue<(string To, string Subject, string Body)> Sent { get; } = new();

    public Task SendAsync(string toAddress, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        Sent.Enqueue((toAddress, subject, htmlBody));
        return Task.CompletedTask;
    }

    public int CountFor(string email)
        => Sent.Count(m => string.Equals(m.To, email, StringComparison.OrdinalIgnoreCase));

    public string LatestOtpFor(string email)
    {
        var body = Sent.Last(m => string.Equals(m.To, email, StringComparison.OrdinalIgnoreCase)).Body;
        return OtpPattern.Match(body).Groups[1].Value;
    }
}

/// <summary>
/// Thay xac minh id_token that cua Google (can mang + client id). Token test co dang
/// "subject|email|name" — chi dung trong host test.
/// </summary>
public sealed class FakeGoogleTokenVerifier : IGoogleTokenVerifier
{
    public static string Token(string subject, string email, string name) => $"{subject}|{email}|{name}";

    public Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct = default)
    {
        var parts = idToken.Split('|');
        return Task.FromResult(new GoogleIdentity(parts[0], parts[1], parts[2]));
    }
}
