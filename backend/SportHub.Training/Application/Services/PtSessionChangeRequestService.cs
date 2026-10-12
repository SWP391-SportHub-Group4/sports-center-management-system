using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;
using SportHub.Training.Application.Interfaces;
using SportHub.Training.Domain.Rules;

namespace SportHub.Training.Application.Services;

/// <summary>
/// Member xin Cancel/Reschedule một PtSession; Manager duyệt/từ chối — BE-4 §5.3/§6.3/§6.4.
/// Approve gọi lại <see cref="PtSessionService.ApplyCancelAsync"/>/<see cref="PtSessionService.ApplyRescheduleAsync"/>
/// bằng TimingClassification đã lưu từ lúc Member gửi yêu cầu (không tính lại tại lúc duyệt).
/// </summary>
public sealed class PtSessionChangeRequestService(
    ISportHubDbContext db,
    PtSessionService sessions,
    IAuditWriter audit,
    IClock clock) : IPtSessionChangeRequestService
{
    public const int DefaultPageSize = 50;
    public const int MaximumPageSize = 100;

    public async Task<IReadOnlyList<PtSessionChangeRequestResponse>> MineAsync(Guid memberId, CancellationToken ct = default)
        => await db.Set<PtSessionChangeRequest>().AsNoTracking().Where(r => r.RequestedByUserId == memberId)
            .OrderByDescending(r => r.RequestedAt).Take(100).Select(Projection()).ToListAsync(ct);

    public async Task<IReadOnlyList<PtSessionChangeRequestResponse>> SearchAsync(
        string? status, int page, int pageSize, CancellationToken ct = default)
    {
        var query = db.Set<PtSessionChangeRequest>().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<PtSessionChangeRequestStatus>(status, ignoreCase: true, out var parsed))
            {
                throw new BadRequestException(
                    "pt_change_request_invalid_state", "Pt change request invalid state.");
            }

            query = query.Where(r => r.Status == parsed);
        }

        page = Math.Clamp(page, 1, 100_000);
        pageSize = Math.Clamp(pageSize <= 0 ? DefaultPageSize : pageSize, 1, MaximumPageSize);
        return await query.OrderBy(r => r.RequestedAt).ThenBy(r => r.RequestId)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(Projection()).ToListAsync(ct);
    }

    public async Task<PtSessionChangeRequestResponse> RequestAsync(
        Guid sessionId, RequestPtSessionChangeRequest request, Guid memberId, CancellationToken ct = default)
    {
        if (!SportHub.BuildingBlocks.Api.WireEnum.TryParse<PtSessionChangeRequestType>(request.RequestType, ignoreCase: true, out var requestType))
        {
            throw new BadRequestException(
                "pt_change_request_invalid_state", "Pt change request invalid state.");
        }

        if (requestType == PtSessionChangeRequestType.Reschedule && request.RequestedStartAtUtc is null)
        {
            throw new BadRequestException(
                "pt_change_request_invalid_state", "Pt change request invalid state.");
        }

        var session = await db.Set<PtSession>().AsNoTracking()
            .SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
            ?? throw new NotFoundException("pt_session_not_found", "Pt session not found.");

        if (session.MemberId != memberId)
        {
            throw new ForbiddenException("pt_session_not_owned", "Pt session not owned.");
        }

        if (session.Status != PtSessionStatus.Scheduled)
        {
            throw new ConflictException(
                "pt_change_request_invalid_state",
                "Pt change request invalid state.");
        }

        // Partial unique index (SessionId where Pending) là chốt chặn thật; kiểm trước để trả
        // lỗi có nghĩa, giống tiền lệ BR-19 ở EnrollmentService.
        var alreadyPending = await db.Set<PtSessionChangeRequest>().AnyAsync(
            r => r.SessionId == sessionId && r.Status == PtSessionChangeRequestStatus.Pending, ct);

        if (alreadyPending)
        {
            throw new ConflictException(
                "pt_change_request_already_pending", "Pt change request already pending.");
        }

        var now = clock.UtcNow;
        var timing = PtSessionRules.ClassifyTiming(now, session.StartAtUtc);

        var changeRequest = new PtSessionChangeRequest
        {
            RequestId = Guid.NewGuid(),
            SessionId = sessionId,
            RequestedByUserId = memberId,
            RequestType = requestType,
            RequestedStartAtUtc = requestType == PtSessionChangeRequestType.Reschedule
                ? request.RequestedStartAtUtc
                : null,
            RequestedAt = now,
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim(),
            TimingClassification = timing,
            RequestsException = request.RequestsException,
            Status = PtSessionChangeRequestStatus.Pending
        };

        db.Set<PtSessionChangeRequest>().Add(changeRequest);

        audit.Write(new AuditEntry(
            memberId, "CREATE_PT_SESSION_CHANGE_REQUEST", nameof(PtSessionChangeRequest),
            changeRequest.RequestId.ToString(),
            NewValue: $"{{\"sessionId\":\"{sessionId}\",\"requestType\":\"{requestType}\",\"timing\":\"{timing}\"}}"));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException(
                "pt_change_request_already_pending", "Pt change request already pending.");
        }

        return await GetOneAsync(changeRequest.RequestId, ct);
    }

    public async Task<PtSessionChangeRequestResponse> ApproveAsync(
        Guid requestId, ReviewPtSessionChangeRequest request, Guid managerId, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var changeRequest = await LockRequestAsync(requestId, ct);

        EnsurePending(changeRequest);

        var reason = changeRequest.Reason ?? "Requested by member";

        changeRequest.Status = PtSessionChangeRequestStatus.Approved;
        changeRequest.ReviewedByUserId = managerId;
        changeRequest.ReviewedAt = clock.UtcNow;
        changeRequest.ReviewNote = string.IsNullOrWhiteSpace(request.ReviewNote) ? null : request.ReviewNote.Trim();

        audit.Write(new AuditEntry(
            managerId, "REVIEW_PT_SESSION_CHANGE_REQUEST", nameof(PtSessionChangeRequest), requestId.ToString(),
            NewValue: "{\"status\":\"Approved\"}"));

        if (changeRequest.RequestType == PtSessionChangeRequestType.Cancel)
        {
            await sessions.ApplyCancelAsync(
                changeRequest.SessionId, changeRequest.TimingClassification, reason, managerId,
                "APPROVE_PT_SESSION_CHANGE_REQUEST", ct, manageTransaction: false);
        }
        else
        {
            await sessions.ApplyRescheduleAsync(
                changeRequest.SessionId, changeRequest.TimingClassification, changeRequest.RequestedStartAtUtc!.Value,
                reason, managerId, "APPROVE_PT_SESSION_CHANGE_REQUEST", ct, manageTransaction: false);
        }

        await transaction.CommitAsync(ct);

        return await GetOneAsync(requestId, ct);
    }

    public async Task<PtSessionChangeRequestResponse> RejectAsync(
        Guid requestId, ReviewPtSessionChangeRequest request, Guid managerId, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var changeRequest = await LockRequestAsync(requestId, ct);

        EnsurePending(changeRequest);

        changeRequest.Status = PtSessionChangeRequestStatus.Rejected;
        changeRequest.ReviewedByUserId = managerId;
        changeRequest.ReviewedAt = clock.UtcNow;
        changeRequest.ReviewNote = string.IsNullOrWhiteSpace(request.ReviewNote) ? null : request.ReviewNote.Trim();

        audit.Write(new AuditEntry(
            managerId, "REVIEW_PT_SESSION_CHANGE_REQUEST", nameof(PtSessionChangeRequest), requestId.ToString(),
            NewValue: "{\"status\":\"Rejected\"}"));

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return await GetOneAsync(requestId, ct);
    }

    private async Task<PtSessionChangeRequest> LockRequestAsync(Guid requestId, CancellationToken ct)
    {
        var rows = await db.Set<PtSessionChangeRequest>()
            .FromSqlInterpolated(
                $"SELECT * FROM pt_session_change_requests WHERE request_id = {requestId} FOR UPDATE")
            .ToListAsync(ct);

        return rows.SingleOrDefault()
            ?? throw new NotFoundException("pt_session_not_found", "Pt session not found.");
    }

    private static void EnsurePending(PtSessionChangeRequest changeRequest)
    {
        if (changeRequest.Status != PtSessionChangeRequestStatus.Pending)
        {
            throw new ConflictException(
                "pt_change_request_invalid_state",
                "Pt change request invalid state.");
        }
    }

    private async Task<PtSessionChangeRequestResponse> GetOneAsync(Guid requestId, CancellationToken ct)
        => await db.Set<PtSessionChangeRequest>().AsNoTracking()
               .Where(r => r.RequestId == requestId).Select(Projection()).SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("pt_session_not_found", "Pt session not found.");

    private static Expression<Func<PtSessionChangeRequest, PtSessionChangeRequestResponse>> Projection()
        => r => new PtSessionChangeRequestResponse(
            r.RequestId,
            r.SessionId,
            r.Session!.StartAtUtc,
            r.Session.MemberId,
            r.Session.CoachId,
            r.RequestedByUserId,
            r.RequestType.ToString(),
            r.RequestedStartAtUtc,
            r.RequestedAt,
            r.Reason,
            r.TimingClassification.ToString(),
            r.RequestsException,
            r.Status.ToString(),
            r.ReviewedByUserId,
            r.ReviewedAt,
            r.ReviewNote);
}
