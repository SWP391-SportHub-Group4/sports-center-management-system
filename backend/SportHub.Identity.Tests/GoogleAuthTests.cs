using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using SportHub.API.Controllers;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Infrastructure.Authentication;
using SportHub.Identity.Application.Auth;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Identity.Infrastructure.Authentication;
using Xunit;

namespace SportHub.Identity.Tests;

public sealed class GoogleAuthTests : IDisposable
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly TestDb db;
    private readonly StubVerifier verifier = new();
    private readonly GoogleAuthService service;

    public GoogleAuthTests()
    {
        connection.Open();
        db = new TestDb(new DbContextOptionsBuilder<TestDb>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        service = new GoogleAuthService(db, verifier, Options.Create(new JwtOptions
        {
            Issuer = "tests", Audience = "tests", SecretKey = new string('x', 64)
        }));
    }

    [Fact]
    public async Task NewGoogleUserCreatesMemberProfileAndLoginWithoutPassword()
    {
        var result = await service.GoogleLoginAsync("token");
        var user = await db.Set<UserAccount>().Include(x => x.Profile).Include(x => x.Credential)
            .Include(x => x.ExternalLogins).SingleAsync();
        Assert.Equal(user.UserId, result.UserId);
        Assert.Equal(3, user.RoleId);
        Assert.NotNull(user.Profile);
        Assert.Null(user.Credential);
        Assert.Equal("google-sub", Assert.Single(user.ExternalLogins).ProviderUserId);
        Assert.False(string.IsNullOrWhiteSpace(result.AccessToken));
    }

    [Fact]
    public async Task ExistingEmailWithDifferentCaseNeverCreatesOrLinksAccount()
    {
        await AddUser("MEMBER@example.com");
        var error = await Assert.ThrowsAsync<AuthException>(() => service.GoogleLoginAsync("token"));
        Assert.Equal("GOOGLE_LINK_REQUIRED", error.Code);
        Assert.Equal(1, await db.Set<UserAccount>().CountAsync());
        Assert.Empty(await db.Set<UserExternalLogin>().ToListAsync());
    }

    [Fact]
    public async Task LinkedSubjectLogsIntoOriginalAccountEvenWhenGoogleEmailChanges()
    {
        var original = await service.GoogleLoginAsync("token");
        verifier.Identity = verifier.Identity with { Email = "changed@example.com" };
        var result = await service.GoogleLoginAsync("token");
        Assert.Equal(original.UserId, result.UserId);
        Assert.Equal(1, await db.Set<UserAccount>().CountAsync());
    }

    [Theory]
    [InlineData(UserStatus.Banned)]
    [InlineData(UserStatus.Deactivated)]
    public async Task InactiveAccountsCannotLoginOrLink(UserStatus status)
    {
        var result = await service.GoogleLoginAsync("token");
        var user = await db.Set<UserAccount>().SingleAsync();
        user.Status = status;
        await db.SaveChangesAsync();
        Assert.Equal(403, (await Assert.ThrowsAsync<AuthException>(() => service.GoogleLoginAsync("token"))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<AuthException>(() => service.LinkGoogleAsync(result.UserId, "token"))).StatusCode);
    }

    [Fact]
    public async Task LinkTargetsAuthenticatedUserAndIsIdempotent()
    {
        var user = await AddUser("local@example.com");
        await service.LinkGoogleAsync(user.UserId, "token");
        await service.LinkGoogleAsync(user.UserId, "token");
        Assert.Equal(user.UserId, (await db.Set<UserExternalLogin>().SingleAsync()).UserId);
        Assert.Equal("local@example.com", user.Email);
    }

    [Fact]
    public async Task CannotStealGoogleLinkOrReplaceExistingProvider()
    {
        var first = await AddUser("first@example.com");
        var second = await AddUser("second@example.com");
        await service.LinkGoogleAsync(first.UserId, "token");
        Assert.Equal("GOOGLE_ALREADY_LINKED", (await Assert.ThrowsAsync<AuthException>(
            () => service.LinkGoogleAsync(second.UserId, "token"))).Code);
        verifier.Identity = verifier.Identity with { Subject = "another-sub" };
        Assert.Equal("ACCOUNT_ALREADY_LINKED", (await Assert.ThrowsAsync<AuthException>(
            () => service.LinkGoogleAsync(first.UserId, "token"))).Code);
        Assert.Equal(1, await db.Set<UserExternalLogin>().CountAsync());
    }

    [Fact]
    public async Task UnverifiedEmailCannotCreateOrLink()
    {
        var user = await AddUser("local@example.com");
        verifier.Identity = verifier.Identity with { EmailVerified = false };
        await Assert.ThrowsAsync<AuthException>(() => service.GoogleLoginAsync("token"));
        await Assert.ThrowsAsync<AuthException>(() => service.LinkGoogleAsync(user.UserId, "token"));
        Assert.Empty(await db.Set<UserExternalLogin>().ToListAsync());
    }

    [Fact]
    public async Task ControllerReadsTheClaimEmittedBySportHubJwtService()
    {
        var user = await AddUser("local@example.com");
        var controller = new GoogleAuthController(service)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([
                        new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString())], "Bearer"))
                }
            }
        };
        Assert.IsType<NoContentResult>(await controller.LinkGoogle(new GoogleAuthRequest { IdToken = "token" }, default));
        Assert.Equal(user.UserId, (await db.Set<UserExternalLogin>().SingleAsync()).UserId);
    }

    [Theory]
    [InlineData("valid")]
    [InlineData("audience")]
    [InlineData("issuer")]
    [InlineData("expired")]
    [InlineData("signature")]
    [InlineData("subject")]
    public async Task VerifierChecksSignedTokens(string scenario)
    {
        using var rsa = RSA.Create(2048);
        using var otherRsa = RSA.Create(2048);
        var key = new RsaSecurityKey(rsa) { KeyId = "test-key" };
        var config = new OpenIdConnectConfiguration();
        config.SigningKeys.Add(key);
        var googleVerifier = new GoogleTokenVerifier(new StaticConfigurationManager<OpenIdConnectConfiguration>(config),
            Options.Create(new GoogleAuthOptions { ClientId = "client-id" }));
        var claims = new List<Claim> { new("email", "member@example.com"), new("email_verified", "true") };
        if (scenario != "subject") claims.Add(new Claim("sub", "google-sub"));
        var token = new JwtSecurityToken(
            scenario == "issuer" ? "https://attacker.example" : "https://accounts.google.com",
            scenario == "audience" ? "another-client" : "client-id", claims,
            DateTime.UtcNow.AddHours(-2), scenario == "expired" ? DateTime.UtcNow.AddHours(-1) : DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(scenario == "signature" ? new RsaSecurityKey(otherRsa) { KeyId = "test-key" } : key,
                SecurityAlgorithms.RsaSha256));
        var encoded = new JwtSecurityTokenHandler().WriteToken(token);
        if (scenario == "valid")
            Assert.Equal("google-sub", (await googleVerifier.VerifyAsync(encoded, default)).Subject);
        else
            Assert.Equal(401, (await Assert.ThrowsAsync<AuthException>(() => googleVerifier.VerifyAsync(encoded, default))).StatusCode);
    }

    private async Task<UserAccount> AddUser(string email)
    {
        var user = new UserAccount { UserId = Guid.NewGuid(), Email = email, RoleId = 3, Status = UserStatus.Active, CreatedAt = DateTime.UtcNow };
        db.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    public void Dispose() { db.Dispose(); connection.Dispose(); }

    private sealed class StubVerifier : IGoogleTokenVerifier
    {
        public GoogleIdentity Identity { get; set; } = new("google-sub", "member@example.com", true, "Member");
        public Task<GoogleIdentity> VerifyAsync(string token, CancellationToken ct) => Task.FromResult(Identity);
    }

    private sealed class TestDb(DbContextOptions<TestDb> options) : DbContext(options), ISportHubDbContext
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(IdentityModuleMarker).Assembly);
            // SQLite substitute for PostgreSQL citext; production uses the actual citext unique index.
            modelBuilder.Entity<UserAccount>().Property(x => x.Email).HasColumnType("TEXT").UseCollation("NOCASE");
        }
    }
}
