using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.Administration.Application.Commands;
using SportHub.Administration.Application.DTOs;
using SportHub.Administration.Application.Interfaces;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Api;
using SportHub.Identity.Domain.Enums;

namespace SportHub.Administration.Api;

/// <summary>Cấu hình toàn hệ thống — BR-39 (chỉ Center Manager).</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.CenterManager)]
[Route("api/system-settings")]
public class SystemSettingsController(ISystemSettingService settings) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct) => Ok(await settings.GetAllAsync(ct));

    [HttpPut("{key}")]
    public async Task<IActionResult> Update(
        string key, [FromBody] UpdateSystemSettingRequest request, CancellationToken ct)
        => Ok(await settings.UpdateAsync(key, request.Value, User.RequireUserId(), ct));
}
