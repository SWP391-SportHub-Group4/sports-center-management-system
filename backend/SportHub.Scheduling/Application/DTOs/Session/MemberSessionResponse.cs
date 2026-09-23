namespace SportHub.Scheduling.Application.DTOs;

/// <summary>Buổi học kèm tình trạng đăng ký của chính người đang xem — dùng cho màn hình hội viên.</summary>
public sealed record MemberSessionResponse(ClassSessionResponse Session, Guid? MyEnrollmentId, string? MyEnrollmentStatus);
