namespace SportHub.BuildingBlocks.Abstractions.Email;

public sealed record EmailAttachment(
    string FileName,
    string ContentType,
    byte[] Content);

public interface IEmailSender
{
    Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Attachment-aware overload.
    /// Default implementation keeps existing test doubles and senders compatible.
    /// </summary>
    Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        IReadOnlyList<EmailAttachment> attachments,
        CancellationToken cancellationToken = default)
        => SendAsync(
            toAddress,
            subject,
            htmlBody,
            cancellationToken);
}