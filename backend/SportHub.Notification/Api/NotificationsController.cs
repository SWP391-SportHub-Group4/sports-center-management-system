using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Notification.Application;

namespace SportHub.Notification.Api;

/// <summary>
/// Hộp thư trong ứng dụng (BR-33). Mọi endpoint đều là "self action": userId lấy từ JWT,
/// không có đường nào đọc thông báo của người khác.
/// </summary>
[ApiController]
[Authorize]
[Route("api/notifications")]
public class NotificationsController(INotificationService notifications) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMine([FromQuery] bool unreadOnly = false, CancellationToken ct = default)
        => Ok(await notifications.GetMineAsync(User.RequireUserId(), unreadOnly, ct));

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct = default)
        => Ok(new { count = await notifications.CountUnreadAsync(User.RequireUserId(), ct) });

    [HttpPost("{notificationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid notificationId, CancellationToken ct = default)
    {
        await notifications.MarkReadAsync(User.RequireUserId(), notificationId, ct);

        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct = default)
    {
        await notifications.MarkAllReadAsync(User.RequireUserId(), ct);

        return NoContent();
    }
}
