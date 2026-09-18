namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Mot host test + mot container PostgreSQL dung chung cho ca cac test integration:
/// khoi dong container cho tung class se rat cham. Cac test rate limit tu tach nhau
/// bang cach moi test dung mot IP rieng (partition key cua limiter chinh la IP).
/// </summary>
[CollectionDefinition(nameof(SportHubApiCollection))]
public sealed class SportHubApiCollection : ICollectionFixture<SportHubApiFactory>;
