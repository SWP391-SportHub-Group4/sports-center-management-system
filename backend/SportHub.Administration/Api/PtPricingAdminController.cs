using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.Administration.Application.Interfaces;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Api;

namespace SportHub.Administration.Api;

[ApiController, Authorize(Policy = SportHubPolicies.CenterManager), Route("api/manager/pt-pricing")]
public sealed class PtPricingAdminController(ISystemSettingService settings) : ControllerBase
{
    [HttpPut]
    public async Task<IActionResult> Update(UpdateSystemSettingRequest request, CancellationToken ct)
        => Ok(await settings.UpdateAsync(SystemSettingKeys.PtPricePerSessionVnd,
            request.Value, User.RequireUserId(), ct));
}
