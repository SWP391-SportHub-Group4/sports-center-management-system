namespace SportHub.Payment.Application.DTOs;

/// <summary>
/// BR-42 v1.4 — tách rõ hai mốc: <paramref name="ApprovedAtUtc"/> (được phép hoàn) và
/// <paramref name="CompletedAtUtc"/> (tiền đã thực sự ra khỏi quầy). Màn hình duyệt của
/// Manager và màn hình quầy của Lễ tân đọc hai mốc khác nhau.
/// </summary>
public sealed record PaymentAdjustmentResponse(
    Guid AdjustmentId,
    Guid InvoiceId,
    string InvoiceNumber,
    Guid? PaymentId,
    string Type,
    /// <summary>Số tiền hiện hành (sau override của Manager nếu có).</summary>
    decimal Amount,
    /// <summary>Số tiền Lễ tân đề nghị ban đầu; khác Amount khi Manager đã ghi đè.</summary>
    decimal RequestedAmount,
    string Reason,
    string Status,
    Guid RequestedByUserId,
    string RequestedByName,
    Guid? ApprovedByUserId,
    string? ApprovedByName,
    Guid? CompletedByUserId,
    string? CompletedByName,
    string? RefundMethod,
    string? RefundReferenceCode,
    DateTime CreatedAt,
    DateTime? ApprovedAtUtc,
    DateTime? CompletedAtUtc,
    /// <summary>Refund đã duyệt nhưng Lễ tân chưa xác nhận thực trả.</summary>
    bool AwaitingPayout,
    DateTime? ResolvedAt);
