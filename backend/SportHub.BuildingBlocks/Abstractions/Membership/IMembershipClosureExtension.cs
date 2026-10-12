namespace SportHub.BuildingBlocks.Abstractions.Membership;

/// <summary>
/// Gia hạn Membership Active khi Gym đóng cửa vì sự cố của trung tâm (BR-130, BR-138). Sự cố tạm thời không
/// phải căn cứ hoàn tiền: hội viên được cộng thêm đúng số ngày đóng cửa. Chỉ gọi trong transaction của caller;
/// bản cài đặt ở Membership chỉ sửa entity, caller là bên SaveChanges.
/// </summary>
public interface IMembershipClosureExtension
{
    /// <summary>Số hội viên có Membership Active còn hiệu lực hoặc đã xếp lịch nối tiếp từ <paramref name="closureStartLocal"/>.</summary>
    Task<int> CountAffectedMembersAsync(DateOnly closureStartLocal, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cộng <paramref name="days"/> ngày vào EndDate của mọi Membership Active có EndDate &gt;= <paramref name="closureStartLocal"/>;
    /// gói nối tiếp chưa bắt đầu được dời cả StartDate để không chồng lấn. Trả về mỗi hội viên một dòng.
    /// </summary>
    Task<IReadOnlyList<ExtendedMembership>> ExtendActiveAsync(int days, DateOnly closureStartLocal,
        CancellationToken cancellationToken = default);
}

/// <param name="NewEndDate">EndDate mới muộn nhất trong các gói đã gia hạn của hội viên (giờ Việt Nam).</param>
public sealed record ExtendedMembership(Guid MemberId, string Email, Guid MemberPackageId, DateOnly NewEndDate);
