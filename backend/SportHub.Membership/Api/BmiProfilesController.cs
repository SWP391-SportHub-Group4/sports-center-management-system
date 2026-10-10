using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Membership.Application.Services;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Membership.Api;

public sealed record ScheduleBmiRequest(DateTime AppointmentAt);
public sealed record RecordBmiRequest(decimal HeightCm, decimal WeightKg);

[ApiController]
[Authorize]
[Route("api")]
public sealed class BmiProfilesController(MemberBmiProfileService profiles) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("bmi-measurement-requests")]
    public async Task<IActionResult> Requests([FromQuery, Range(1, 100000)] int page = 1, CancellationToken ct = default)
        => Ok(await profiles.RequestsAsync(page, ct));
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/bmi-profile")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var profile = await profiles.GetAsync(User.RequireUserId(), ct);
        return profile is null ? NoContent() : Ok(profile);
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpPost("members/me/bmi-measurement-request")]
    public async Task<IActionResult> RequestMeasurement(CancellationToken ct)
        => Ok(await profiles.RequestAsync(User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpGet("members/{memberId:guid}/bmi-profile")]
    public async Task<IActionResult> GetByMember(Guid memberId, CancellationToken ct)
    {
        var profile = await profiles.GetAsync(memberId, ct);
        return profile is null ? NoContent() : Ok(profile);
    }

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPut("members/{memberId:guid}/bmi-appointment")]
    public async Task<IActionResult> Schedule(Guid memberId, ScheduleBmiRequest request, CancellationToken ct)
        => Ok(await profiles.ScheduleAsync(memberId, request.AppointmentAt, ct));

    [Authorize(Policy = SportHubPolicies.FrontDesk)]
    [HttpPost("members/{memberId:guid}/bmi-measurement")]
    public async Task<IActionResult> Record(Guid memberId, RecordBmiRequest request, CancellationToken ct)
        => Ok(await profiles.RecordAsync(memberId, request.HeightCm, request.WeightKg, User.RequireUserId(), ct));
}
