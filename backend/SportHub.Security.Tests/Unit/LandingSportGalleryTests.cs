using SportHub.Administration.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Security.Tests.Unit;

public sealed class LandingSportGalleryTests
{
    [Theory]
    [InlineData("gallery.sports.3.name")]
    [InlineData("gallery.sports.3.en")]
    [InlineData("gallery.sports.3.title")]
    public async Task Media_cannot_override_catalog_sport_names(string key)
    {
        // Invalid editorial writes must fail before any database or audit work.
        var controller = new LandingPageController(null!, null!, null!);
        var values = new Dictionary<string, string>
        {
            ["bookmarks.coachIds"] = string.Join(',', Enumerable.Range(0, 3).Select(_ => Guid.NewGuid())),
            [key] = "Changed from Media"
        };
        var error = await Assert.ThrowsAsync<BadRequestException>(() =>
            controller.Update(new LandingPageDocument(Guid.Empty, values, null), CancellationToken.None));
        Assert.Equal("gallery_sport_name_read_only", error.ErrorCode);
        Assert.Equal(400, error.StatusCode);
    }
}
