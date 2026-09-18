using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.API.Extensions;

namespace SportHub.Security.Tests.Integration;

/// <summary>
/// Controller CHI ton tai trong assembly test (nap qua AddApplicationPart cua host test).
/// Khong co endpoint debug nao duoc them vao production.
/// </summary>
[ApiController]
[Route("api/__tests")]
public class TestProtectedController : ControllerBase
{
    /// <summary>Endpoint bao ve tieu chuan: chi can da xac thuc (fallback policy).</summary>
    [HttpGet("protected")]
    public IActionResult Protected()
    {
        ActionExecuted = true;
        return Ok(new { ok = true });
    }

    /// <summary>Endpoint yeu cau role cu the — de kiem tra 403 van di qua OnForbidden cu.</summary>
    [HttpGet("manager-only")]
    [Authorize(Policy = AuthorizationPolicyExtensions.CenterManagerPolicy)]
    public IActionResult ManagerOnly()
    {
        ActionExecuted = true;
        return Ok(new { ok = true });
    }

    [AllowAnonymous]
    [HttpGet("public")]
    public IActionResult Public() => Ok(new { ok = true });

    /// <summary>
    /// Dat true khi action than su chay. Dung de khang dinh request bi chan KHONG
    /// cham toi action. Static vi moi request tao instance controller moi.
    /// </summary>
    public static bool ActionExecuted { get; set; }

    public static void ResetActionExecuted() => ActionExecuted = false;
}
