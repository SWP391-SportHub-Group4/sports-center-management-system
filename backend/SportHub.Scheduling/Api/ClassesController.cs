using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

/// <summary>Lớp học và mẫu lịch lặp — BR-12, BR-14, BR-15.</summary>
[ApiController]
[Authorize]
[Route("api/classes")]
public class ClassesController(IClassService classes, IClassSessionService sessions) : ControllerBase
{
    /// <summary>Hội viên cũng đọc được để chọn lớp; bộ lọc includeArchived chỉ dành cho Manager.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? discipline,
        [FromQuery] bool includeArchived = false,
        CancellationToken ct = default)
    {
        var allowArchived = includeArchived && User.IsInRole(SportHubRoleNames.CenterManager);

        return Ok(await classes.GetAllAsync(discipline, allowArchived, ct));
    }

    [HttpGet("{classId:int}")]
    public async Task<IActionResult> Get(int classId, CancellationToken ct) => Ok(await classes.GetAsync(classId, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveClassRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await classes.CreateAsync(request, User.RequireUserId(), ct));

    /// <summary>BR-14 — phân công/phân công lại HLV nằm trong đường này, chỉ Center Manager.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("{classId:int}")]
    public async Task<IActionResult> Update(int classId, [FromBody] SaveClassRequest request, CancellationToken ct)
        => Ok(await classes.UpdateAsync(classId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/archive")]
    public async Task<IActionResult> Archive(int classId, CancellationToken ct)
        => Ok(await classes.SetStatusAsync(classId, ClassStatus.Archived, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/reactivate")]
    public async Task<IActionResult> Reactivate(int classId, CancellationToken ct)
        => Ok(await classes.SetStatusAsync(classId, ClassStatus.Active, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/recurrences")]
    public async Task<IActionResult> AddRecurrence(
        int classId, [FromBody] SaveRecurrenceRequest request, CancellationToken ct)
        => Ok(await classes.AddRecurrenceAsync(classId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpDelete("{classId:int}/recurrences/{recurrenceId:int}")]
    public async Task<IActionResult> DeleteRecurrence(int classId, int recurrenceId, CancellationToken ct)
        => Ok(await classes.DeleteRecurrenceAsync(classId, recurrenceId, User.RequireUserId(), ct));

    /// <summary>BR-15 — sinh buổi học từ mẫu lặp. Chạy lại cùng khoảng ngày không nhân đôi lịch.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/generate-sessions")]
    public async Task<IActionResult> GenerateSessions(
        int classId, [FromBody] GenerateSessionsRequest request, CancellationToken ct)
        => Ok(await sessions.GenerateAsync(classId, request, User.RequireUserId(), ct));
}
