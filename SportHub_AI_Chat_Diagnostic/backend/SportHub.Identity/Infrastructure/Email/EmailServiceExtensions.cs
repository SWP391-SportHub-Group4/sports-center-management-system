using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.Abstractions.Email;

namespace SportHub.Identity.Infrastructure.Email;

public static class EmailServiceExtensions
{
    public static IServiceCollection AddSportHubEmail(this IServiceCollection services, IConfiguration configuration, bool isDevelopment)
    {
        var provider = configuration["Email:Provider"]?.Trim() ?? "Smtp";
        if (provider.Equals("Brevo", StringComparison.OrdinalIgnoreCase))
        {
            var section = configuration.GetSection(BrevoEmailOptions.SectionName);
            var settings = section.Get<BrevoEmailOptions>() ?? new();
            if (string.IsNullOrWhiteSpace(settings.ApiKey) ||
                !MailAddress.TryCreate(settings.FromAddress, out var sender) || sender.Address != settings.FromAddress)
                throw new InvalidOperationException("Brevo requires Email:Brevo:ApiKey and a valid verified Email:Brevo:FromAddress.");
            services.Configure<BrevoEmailOptions>(section);
            services.AddHttpClient<BrevoEmailSender>(client => client.Timeout = TimeSpan.FromSeconds(30));
            services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<BrevoEmailSender>());
            return services;
        }
        if (!provider.Equals("Smtp", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Email:Provider must be Smtp or Brevo.");

        var smtp = configuration.GetSection("Smtp");
        if (string.IsNullOrWhiteSpace(smtp["Host"]) && !string.IsNullOrWhiteSpace(configuration["Email:Smtp:Host"]))
            smtp = configuration.GetSection("Email:Smtp");
        if ((!isDevelopment && string.IsNullOrWhiteSpace(smtp["Host"])) ||
            (!string.IsNullOrWhiteSpace(smtp["Host"]) && string.IsNullOrWhiteSpace(smtp["FromAddress"])))
            throw new InvalidOperationException("SMTP Host and FromAddress must be configured when Email:Provider is Smtp.");
        services.Configure<EmailOptions>(smtp);
        services.AddScoped<IEmailSender>(sp =>
            string.IsNullOrWhiteSpace(sp.GetRequiredService<IOptions<EmailOptions>>().Value.Host)
                ? new UnavailableEmailSender()
                : new SmtpEmailSender(sp.GetRequiredService<IOptions<EmailOptions>>()));
        return services;
    }
}
