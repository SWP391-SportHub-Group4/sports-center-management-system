using SportHub.BuildingBlocks.Abstractions.Email;

namespace SportHub.Identity.Infrastructure.Email;

/// <summary>Missing SMTP must never turn a production OTP into a log entry.</summary>
public sealed class UnavailableEmailSender : IEmailSender
{
    public Task SendAsync(string toAddress, string subject, string htmlBody, CancellationToken cancellationToken = default)
        => throw new InvalidOperationException("SMTP is not configured. Email delivery is unavailable.");
}
