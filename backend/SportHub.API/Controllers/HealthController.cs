using Microsoft.AspNetCore.Mvc;

namespace SportHub.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    // Endpoint đầu tiên để xác nhận skeleton chạy được trước khi bắt đầu bước 1 (Identity/RBAC)
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", service = "SportHub.API" });
}
