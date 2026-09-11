using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SportHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous] // fallback policy yêu cầu auth mặc định -> health check cần public
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", service = "SportHub.API" });
}
