using System.Net;
using System.Text.RegularExpressions;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using SportHub.BuildingBlocks.Abstractions.Email;

namespace SportHub.Identity.Infrastructure.Email;

public sealed class SmtpEmailSender(IOptions<EmailOptions> options) : IEmailSender
{
    public async Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default)
    {
        var smtp = options.Value;

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(smtp.FromName, smtp.FromAddress));
        message.To.Add(MailboxAddress.Parse(toAddress));
        message.Subject = subject;
        // Thư chỉ có phần HTML dễ bị Gmail xếp vào rác; kèm bản văn bản thuần (link vẫn bấm được).
        message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = ToPlainText(htmlBody) }.ToMessageBody();

        using var client = new SmtpClient();

        await client.ConnectAsync(
            smtp.Host,
            smtp.Port,
            smtp.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable,
            cancellationToken);

        if (!string.IsNullOrEmpty(smtp.Username))
        {
            await client.AuthenticateAsync(smtp.Username, smtp.Password, cancellationToken);
        }

        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }


    private static string ToPlainText(string html)
    {
        var text = Regex.Replace(html, @"(?is)<(head|style|script).*?</\1>", string.Empty);
        text = Regex.Replace(text, @"(?is)<a\s[^>]*href=""([^""]+)""[^>]*>(.*?)</a>", "$2: $1");
        text = Regex.Replace(text, @"(?i)<(br|/p|/h1|/tr|/div)[^>]*>", "\n");
        text = Regex.Replace(text, "<[^>]+>", string.Empty);
        text = WebUtility.HtmlDecode(text);
        return Regex.Replace(text, @"\n\s*\n+", "\n\n").Trim();
    }
}
