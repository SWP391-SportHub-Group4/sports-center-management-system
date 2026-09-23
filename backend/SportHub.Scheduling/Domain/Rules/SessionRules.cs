using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Scheduling.Domain.Rules;

/// <summary>
/// Quy tắc của buổi học và đăng ký — BR-13/BR-51 (sức chứa), BR-50 (phân loại hủy),
/// BR-54 (điều kiện hủy/dời).
/// </summary>
public static class SessionRules
{
    /// <summary>
    /// BR-51 — trần sức chứa của buổi: MIN(sức chứa phòng, sức chứa lớp) TẠI THỜI ĐIỂM TẠO.
    /// Gọi đúng một lần khi sinh buổi; không bao giờ tính lại cho buổi đã tồn tại.
    /// </summary>
    public static int ComputeBaselineCapacity(int roomCapacity, int classCapacity)
        => Math.Max(1, Math.Min(roomCapacity, classCapacity));

    /// <summary>
    /// BR-51 — Manager được GIẢM sức chứa của một buổi cụ thể, không bao giờ được tăng vượt
    /// trần gốc. Đổi sang phòng lớn hơn cũng không nới trần: trần đã chốt lúc tạo.
    ///
    /// Khi đổi sang phòng NHỎ hơn thì phòng mới thành ràng buộc chặt hơn, nên trần hiệu lực
    /// là MIN(trần gốc, sức chứa phòng mới).
    /// </summary>
    public static void ValidateCapacityChange(int newCapacity, int baselineCapacity, int roomCapacity)
    {
        var ceiling = Math.Min(baselineCapacity, roomCapacity);

        if (newCapacity < 1 || newCapacity > ceiling)
        {
            throw new BadRequestException(
                "invalid_session_capacity",
                $"Sức chứa buổi học phải trong khoảng 1–{ceiling} (BR-51: không vượt trần tại thời điểm tạo).");
        }
    }

    /// <summary>
    /// BR-50 — mốc hạn hủy của MỘT đăng ký, tính từ giờ bắt đầu buổi và số giờ đã CHỤP vào
    /// đăng ký đó lúc xác nhận. Không đọc cấu hình hiện hành: cấu hình đổi sau không được
    /// làm đổi điều kiện của đăng ký cũ.
    /// </summary>
    public static DateTime CancellationDeadline(DateTime sessionStartAtUtc, int cancellationDeadlineHours)
        => sessionStartAtUtc.AddHours(-cancellationDeadlineHours);

    /// <summary>
    /// BR-50 — hủy TẠI hoặc TRƯỚC hạn được coi là đúng hạn (so sánh &lt;=, không phải &lt;).
    /// BR-18 — chỉ hủy đúng hạn mới được hoàn lượt.
    /// </summary>
    public static EnrollmentStatus ClassifyCancellation(
        DateTime cancelledAtUtc,
        DateTime sessionStartAtUtc,
        int cancellationDeadlineHours)
        => cancelledAtUtc <= CancellationDeadline(sessionStartAtUtc, cancellationDeadlineHours)
            ? EnrollmentStatus.CancelledOnTime
            : EnrollmentStatus.CancelledLate;

    /// <summary>
    /// BR-54 chỉ cho hủy/dời buổi học CHƯA BẮT ĐẦU. Buổi đã bắt đầu hoặc đã kết thúc thì
    /// điểm danh mới là việc phải làm, không phải hủy.
    /// </summary>
    public static void EnsureCancellableOrReschedulable(ClassSession session, DateTime nowUtc)
    {
        if (session.Status != ClassSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "session_not_scheduled",
                $"Buổi học đang ở trạng thái {session.Status}, chỉ buổi Scheduled mới hủy/dời được.");
        }

        if (session.StartAtUtc <= nowUtc)
        {
            throw new ConflictException(
                "session_already_started",
                "Buổi học đã bắt đầu — không hủy hoặc dời được (BR-54).");
        }
    }
}
