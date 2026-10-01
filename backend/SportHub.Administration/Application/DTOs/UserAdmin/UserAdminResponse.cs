namespace SportHub.Administration.Application.DTOs;

public sealed record UserAdminResponse(
    Guid UserId,
    string Email,
    string FullName,
    string? Phone,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Role,
    [property: SportHub.BuildingBlocks.Api.WireEnum] string Status,
    DateTime CreatedAt,
    bool HasPassword,
    bool HasGoogleLink,

    /// <summary>Môn chuyên môn của Coach (BR-96, thay CoachCategory); rỗng với role khác.</summary>
    IReadOnlyList<int> SportIds);
