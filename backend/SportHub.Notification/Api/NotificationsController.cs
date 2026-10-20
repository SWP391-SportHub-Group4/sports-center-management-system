using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Notification.Application.Interfaces;

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

    [HttpGet("inbox")]
    public async Task<IActionResult> Inbox([FromQuery] bool unreadOnly = false, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
        => Ok(await notifications.GetInboxAsync(User.RequireUserId(), unreadOnly, search, page, pageSize, ct));

    [HttpGet("{notificationId:guid}")]
    public async Task<IActionResult> Detail(Guid notificationId, CancellationToken ct = default)
        => Ok(await notifications.GetAsync(User.RequireUserId(), notificationId, ct));

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
