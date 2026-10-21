using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SportHub.API.Persistence;

/// <summary>Schema tooling must not start jobs, send messages, or require JWT credentials.</summary>
public sealed class SportHubDesignTimeFactory : IDesignTimeDbContextFactory<SportHubDbContext>
{
    public SportHubDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
            ?? "Host=127.0.0.1;Port=5432;Database=sporthub;Username=sporthub";
        return new SportHubDbContext(new DbContextOptionsBuilder<SportHubDbContext>()
            .UseNpgsql(connection).UseSnakeCaseNamingConvention().Options);
    }
}
