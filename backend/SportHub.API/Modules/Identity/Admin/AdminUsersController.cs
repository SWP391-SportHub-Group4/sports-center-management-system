using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.API.Extensions;

namespace SportHub.API.Modules.Identity.Admin;

[ApiController]
[Authorize(Policy = AuthorizationPolicyExtensions.SystemAdministratorPolicy)]
public sealed class AdminUsersController : ControllerBase
{
    private readonly AdminUserService _service;

    public AdminUsersController(AdminUserService service)
    {
        _service = service;
    }

    [HttpGet("api/admin/users")]
    [ProducesResponseType(typeof(AdminUserListResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUsers(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] string? status = null,
        CancellationToken cancellationToken = default)
        => await ExecuteAsync(async () => Ok(await _service.GetUsersAsync(page, pageSize, search, role, status, cancellationToken)));

    [HttpGet("api/admin/users/{userId:guid}")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUser(Guid userId, CancellationToken cancellationToken)
        => await ExecuteAsync(async () => Ok(await _service.GetUserAsync(userId, cancellationToken)));

    [HttpGet("api/admin/roles")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminRoleResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRoles(CancellationToken cancellationToken)
        => await ExecuteAsync(async () => Ok(await _service.GetRolesAsync(cancellationToken)));

    // Endpoint committed by Design v2 §4.1 / BR-2.
    [HttpPost("api/users/staff")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateInternalAccount(
        [FromBody] CreateInternalAccountRequest request,
        CancellationToken cancellationToken)
        => await ExecuteAsync(async () =>
        {
            var actorUserId = GetCurrentUserId();
            var response = await _service.CreateInternalAccountAsync(
                request,
                actorUserId,
                GetClientIpAddress(),
                cancellationToken);

            return Created($"/api/admin/users/{response.UserId}", response);
        });

    // Needed to implement the SRS UC-04 action "assign or change user role".
    // Roles themselves remain fixed seed data and are NOT created through an API.
    [HttpPut("api/users/{userId:guid}/role")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateRole(
        Guid userId,
        [FromBody] UpdateUserRoleRequest request,
        CancellationToken cancellationToken)
        => await ExecuteAsync(async () => Ok(await _service.UpdateRoleAsync(
            userId,
            request,
            GetCurrentUserId(),
            GetClientIpAddress(),
            cancellationToken)));

    // Endpoint committed by Design v2 §4.1 / BR-6.
    [HttpPut("api/users/{userId:guid}/status")]
    [ProducesResponseType(typeof(AdminUserDetailResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateStatus(
        Guid userId,
        [FromBody] UpdateUserStatusRequest request,
        CancellationToken cancellationToken)
        => await ExecuteAsync(async () => Ok(await _service.UpdateStatusAsync(
            userId,
            request,
            GetCurrentUserId(),
            GetClientIpAddress(),
            cancellationToken)));

    private Guid GetCurrentUserId()
    {
        var value = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(value, out var userId))
            throw new AdminOperationException(StatusCodes.Status401Unauthorized, "invalid_subject", "Authenticated token does not contain a valid user id.");

        return userId;
    }

    private string GetClientIpAddress()
        => HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    private static async Task<IActionResult> ExecuteAsync(Func<Task<IActionResult>> action)
    {
        try
        {
            return await action();
        }
        catch (AdminOperationException ex)
        {
            return new ObjectResult(new
            {
                error = ex.Code,
                message = ex.Message
            })
            {
                StatusCode = ex.StatusCode
            };
        }
    }
}
