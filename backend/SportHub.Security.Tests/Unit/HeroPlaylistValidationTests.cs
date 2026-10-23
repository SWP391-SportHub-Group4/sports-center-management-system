using System.Text.Json;
using SportHub.Administration.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Security.Tests.Unit;

public sealed class HeroPlaylistValidationTests
{
    [Theory]
    [InlineData(4, "https://example.com/clip.webm", "https://example.com/poster.jpg")]
    [InlineData(1, "blob:https://example.com/temporary", "https://example.com/poster.jpg")]
    [InlineData(1, "https://example.com/clip.mp4", "https://example.com/poster.jpg")]
    [InlineData(1, "https://example.com/clip.webm", "javascript:alert(1)")]
    [InlineData(0, "https://example.com/clip.webm", "https://example.com/poster.jpg")]
    public async Task Invalid_playlists_are_rejected_before_any_database_write(int count, string url, string poster)
    {
        var controller = new LandingPageController(null!, null!, null!);
        var values = new Dictionary<string, string> {
            ["bookmarks.coachIds"] = string.Join(',', Enumerable.Range(0, 3).Select(_ => Guid.NewGuid())),
            ["hero.background.playlist"] = JsonSerializer.Serialize(Enumerable.Range(0, count).Select(index => new { url, poster, name = $"Video {index + 1}" })),
        };
        var error = await Assert.ThrowsAsync<BadRequestException>(() => controller.Update(new LandingPageDocument(Guid.NewGuid(), values, null), default));
        Assert.Equal("invalid_hero_playlist", error.ErrorCode);
    }
}
